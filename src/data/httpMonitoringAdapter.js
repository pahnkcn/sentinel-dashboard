import { notifyInvalidAuthSession } from '../auth/authSession.js';
import { decodeAssessment, decodeLog, decodeStudent } from '../domain/records.js';
import { decodeDatasetManifest } from './datasetManifest.js';
import { MONITORING_STREAMS } from './monitoringDataStore.js';

const STREAM_DECODERS = Object.freeze({
  students: decodeStudent,
  logs: decodeLog,
  assessments: decodeAssessment,
});
const MAX_PAGES_PER_STREAM = 10_000;
const MAX_PAGE_TOKEN_LENGTH = 2_048;
const MAX_DATASET_RESTARTS = 3;
const SAFE_ERROR_CODE = /^[a-z0-9/_-]{1,80}$/i;

function adapterError(code, status = 0) {
  const error = new Error(code);
  error.code = SAFE_ERROR_CODE.test(code) ? code : 'unknown';
  error.status = status;
  return error;
}

function publicResponseCode(response, body, fallback = 'unavailable') {
  if (response.status === 401) return 'unauthenticated';
  if (response.status === 403) return 'permission-denied';
  if (response.status === 409) return 'dataset-version-changed';
  const candidate = body?.error?.code;
  return typeof candidate === 'string' && SAFE_ERROR_CODE.test(candidate)
    ? candidate
    : fallback;
}

async function fetchJson(fetchImplementation, url, signal) {
  const response = await fetchImplementation(url, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const code = publicResponseCode(response, body);
    if (response.status === 401) notifyInvalidAuthSession();
    throw adapterError(code, response.status);
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw adapterError('invalid-api-response');
  }
  return body;
}

async function fetchManifest(fetchImplementation, signal) {
  const body = await fetchJson(fetchImplementation, '/api/manifest', signal);
  const decoded = decodeDatasetManifest(body);
  if (!decoded.ok) throw adapterError(decoded.error.code);
  return decoded.value;
}

function decodePageRecords(stream, rawRecords) {
  const decoder = STREAM_DECODERS[stream];
  const records = [];
  const issues = [];

  for (const rawRecord of rawRecords) {
    const documentId = typeof rawRecord?.id === 'string'
      ? rawRecord.id
      : (typeof rawRecord?.documentId === 'string' ? rawRecord.documentId : '');
    const data = rawRecord?.data !== null && typeof rawRecord?.data === 'object'
      ? rawRecord.data
      : rawRecord;
    try {
      const decoded = decoder({ documentId, data });
      if (decoded.ok) records.push(decoded.value);
      else issues.push({ documentId, issues: decoded.issues });
    } catch {
      issues.push({
        documentId,
        issues: [{ field: 'document', message: 'document could not be decoded' }],
      });
    }
  }
  return { records, issues };
}

async function fetchStream(fetchImplementation, stream, version, signal) {
  const records = [];
  const issues = [];
  const seenTokens = new Set();
  let pageToken = null;

  for (let page = 0; page < MAX_PAGES_PER_STREAM; page += 1) {
    const query = new URLSearchParams({ stream, version });
    if (pageToken !== null) query.set('pageToken', pageToken);
    const body = await fetchJson(fetchImplementation, `/api/monitoring?${query}`, signal);
    if (!Array.isArray(body.records)) throw adapterError('invalid-api-response');

    const decoded = decodePageRecords(stream, body.records);
    records.push(...decoded.records);
    issues.push(...decoded.issues);

    if (body.nextPageToken === null || body.nextPageToken === undefined) {
      return { records, issues, truncated: false };
    }
    if (
      typeof body.nextPageToken !== 'string'
      || body.nextPageToken.length === 0
      || body.nextPageToken.length > MAX_PAGE_TOKEN_LENGTH
      || seenTokens.has(body.nextPageToken)
    ) {
      throw adapterError('invalid-page-token');
    }
    seenTokens.add(body.nextPageToken);
    pageToken = body.nextPageToken;
  }
  throw adapterError('pagination-limit-exceeded');
}

function sameManifest(left, right) {
  return left.version === right.version
    && left.schemaVersion === right.schemaVersion
    && left.dataClassification === right.dataClassification
    && left.publishedAt === right.publishedAt;
}

export function createHttpMonitoringAdapter({
  fetchImplementation = globalThis.fetch,
  clock = Date.now,
} = {}) {
  if (typeof fetchImplementation !== 'function') {
    throw new TypeError('HTTP monitoring adapter requires fetch');
  }

  return {
    connect(observer) {
      const controller = new AbortController();
      let active = true;

      const reportFailure = error => {
        if (!active || error?.name === 'AbortError') return;
        for (const stream of MONITORING_STREAMS) observer.error(stream, error);
      };

      const load = async () => {
        for (let attempt = 0; attempt < MAX_DATASET_RESTARTS; attempt += 1) {
          try {
            const manifest = await fetchManifest(fetchImplementation, controller.signal);
            if (!active) return;
            observer.beginDataset(manifest.version);

            const payloads = await Promise.all(MONITORING_STREAMS.map(stream => (
              fetchStream(fetchImplementation, stream, manifest.version, controller.signal)
            )));
            const verifiedManifest = await fetchManifest(fetchImplementation, controller.signal);
            if (!active) return;
            if (!sameManifest(manifest, verifiedManifest)) continue;

            observer.replaceDataset({
              ...manifest,
              verifiedAt: clock(),
              streams: Object.fromEntries(
                MONITORING_STREAMS.map((stream, index) => [stream, payloads[index]]),
              ),
            });
            return;
          } catch (error) {
            if (!active || error?.name === 'AbortError') return;
            if (error?.code === 'dataset-version-changed') continue;
            throw error;
          }
        }
        throw adapterError('dataset-version-changed');
      };

      void load().catch(reportFailure);
      return () => {
        if (!active) return;
        active = false;
        controller.abort();
      };
    },
  };
}
