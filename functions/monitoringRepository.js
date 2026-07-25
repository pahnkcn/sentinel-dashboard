import { FieldPath, getFirestore } from 'firebase-admin/firestore';

import {
  decodeAssessment,
  decodeLog,
  decodeStudent,
} from './domain/records.js';

const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export const SERVER_MONITORING_LIMITS = Object.freeze({
  students: 250,
  logs: 28_000,
  assessments: 1_000,
});

const STREAMS = Object.freeze([
  ['students', decodeStudent],
  ['logs', decodeLog],
  ['assessments', decodeAssessment],
]);
const RAW_CACHE_TTL_MS = 60_000;

let cachedDataset = null;
let cacheTimer = null;
const inFlightDatasets = new Map();

function repositoryError(code) {
  const error = new Error(code);
  error.publicCode = 'chat-data-unavailable';
  error.stage = 'retrieval';
  return error;
}

function readVersion(snapshot) {
  const version = snapshot.exists ? snapshot.data()?.version : null;
  if (typeof version !== 'string' || !VERSION_PATTERN.test(version)) {
    throw repositoryError('invalid-current-dataset');
  }
  return version;
}

async function readStream(firestore, version, streamName, decoder, limit) {
  const snapshot = await firestore
    .collection('monitoringDatasets')
    .doc(version)
    .collection(streamName)
    .orderBy(FieldPath.documentId())
    .limit(limit + 1)
    .get();

  if (snapshot.size > limit) {
    throw repositoryError(`truncated-${streamName}`);
  }

  const records = [];
  for (const document of snapshot.docs) {
    const decoded = decoder({
      documentId: document.id,
      data: document.data(),
    });
    if (!decoded.ok) throw repositoryError(`invalid-${streamName}`);
    records.push(decoded.value);
  }
  return records;
}

function validateReferences({ students, logs, assessments }) {
  const studentIds = new Set(students.map(student => student.id));
  if (
    logs.some(log => !studentIds.has(log.studentId))
    || assessments.some(assessment => !studentIds.has(assessment.studentId))
  ) {
    throw repositoryError('orphan-monitoring-record');
  }
}

async function loadVersion(firestore, version, clock) {
  const entries = await Promise.all(
    STREAMS.map(async ([streamName, decoder]) => [
      streamName,
      await readStream(
        firestore,
        version,
        streamName,
        decoder,
        SERVER_MONITORING_LIMITS[streamName],
      ),
    ]),
  );
  const dataset = Object.fromEntries(entries);
  validateReferences(dataset);
  return Object.freeze({
    ...dataset,
    version,
    verifiedAt: clock(),
  });
}

async function readVerifiedMonitoringDataset(options = {}) {
  const firestore = options.firestore ?? getFirestore();
  const clock = options.clock ?? Date.now;
  const useCache = options.useCache ?? options.firestore === undefined;
  const manifestReference = firestore
    .collection('monitoringManifests')
    .doc('current');
  const firstManifest = await manifestReference.get();
  const version = readVersion(firstManifest);

  if (useCache && cachedDataset?.version === version) return cachedDataset;

  let candidate;
  if (useCache) {
    if (!inFlightDatasets.has(version)) {
      inFlightDatasets.set(
        version,
        loadVersion(firestore, version, clock).finally(() => {
          inFlightDatasets.delete(version);
        }),
      );
    }
    candidate = await inFlightDatasets.get(version);
  } else {
    candidate = await loadVersion(firestore, version, clock);
  }
  const secondManifest = await manifestReference.get();
  if (readVersion(secondManifest) !== version) {
    throw repositoryError('dataset-changed-during-read');
  }

  if (useCache) {
    cachedDataset = candidate;
    if (cacheTimer) clearTimeout(cacheTimer);
    cacheTimer = setTimeout(() => {
      if (cachedDataset === candidate) cachedDataset = null;
    }, RAW_CACHE_TTL_MS);
    cacheTimer.unref?.();
  }
  return candidate;
}

export async function getVerifiedMonitoringDataset(options = {}) {
  try {
    return await readVerifiedMonitoringDataset(options);
  } catch (error) {
    if (error?.publicCode === 'chat-data-unavailable') throw error;
    throw repositoryError('monitoring-read-failed');
  }
}

export function clearMonitoringDatasetCache() {
  cachedDataset = null;
  inFlightDatasets.clear();
  if (cacheTimer) clearTimeout(cacheTimer);
  cacheTimer = null;
}
