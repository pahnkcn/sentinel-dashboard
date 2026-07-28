import { Buffer } from 'node:buffer';

import { HttpError } from './errors.js';
import { getFirestoreClient } from './firestore.js';
import { validateDoubleSubmitCsrf, verifyGoogleCredential } from './googleIdentity.js';
import {
  allowMethods,
  parseCookies,
  readJsonBody,
  requestQuery,
  sendJson,
  setHeader,
} from './http.js';
import {
  ALLOWED_ROLES,
  authorizedUserDocumentId,
  expiredSessionCookie,
  issueSessionToken,
  normalizeEmail,
  publicSession,
  requireSession,
  sessionCookie,
} from './session.js';

const DATASET_VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const STREAMS = new Map([
  ['students', 250],
  ['logs', 1_000],
  ['assessments', 250],
]);
const MAX_MONITORING_RESPONSE_BYTES = 4_000_000;

function firestoreFrom(dependencies) {
  return dependencies.firestore ?? getFirestoreClient();
}

function manifestShape(value) {
  const publishedAt = typeof value?.publishedAt === 'string' ? value.publishedAt : '';
  if (
    typeof value?.version !== 'string'
    || !DATASET_VERSION.test(value.version)
    || value?.schemaVersion !== 2
    || value?.dataClassification !== 'synthetic'
    || !publishedAt
    || !Number.isFinite(Date.parse(publishedAt))
  ) {
    throw new HttpError(503, 'dataset-manifest-invalid');
  }
  return {
    version: value.version,
    schemaVersion: 2,
    dataClassification: 'synthetic',
    publishedAt,
  };
}

async function currentManifest(firestore) {
  const manifest = await firestore.getDocument('monitoringManifests/current');
  if (!manifest) throw new HttpError(503, 'dataset-manifest-missing');
  return manifestShape(manifest);
}

export async function handleLogin(request, response, dependencies = {}) {
  allowMethods(request, response, ['POST']);
  const body = readJsonBody(request);
  if (
    typeof body.credential !== 'string'
    || typeof body.csrfToken !== 'string'
    || Object.keys(body).some(key => !['credential', 'csrfToken'].includes(key))
  ) {
    throw new HttpError(400, 'invalid-body');
  }
  const cookies = parseCookies(request);
  const validateCsrf = dependencies.validateCsrf ?? validateDoubleSubmitCsrf;
  validateCsrf(cookies.g_csrf_token, body.csrfToken);

  const verifyGoogle = dependencies.verifyGoogle ?? verifyGoogleCredential;
  const googleIdentity = await verifyGoogle(body.credential);
  const firestore = firestoreFrom(dependencies);
  const userId = authorizedUserDocumentId(googleIdentity.email);
  const authorized = await firestore.getDocument(`authorizedUsers/${userId}`);
  const authorizedEmail = normalizeEmail(authorized?.email);
  if (
    authorized?.enabled !== true
    || !ALLOWED_ROLES.has(authorized?.role)
    || authorizedEmail !== googleIdentity.email
  ) {
    throw new HttpError(403, 'forbidden');
  }
  const identity = { ...googleIdentity, role: authorized.role };
  const issueSession = dependencies.issueSession ?? issueSessionToken;
  setHeader(response, 'Set-Cookie', sessionCookie(issueSession(identity)));
  return sendJson(response, 200, publicSession(identity));
}

export async function handleSession(request, response, dependencies = {}) {
  allowMethods(request, response, ['GET']);
  const authorize = dependencies.requireSession ?? requireSession;
  let identity;
  try {
    identity = await authorize(request);
  } catch (error) {
    if (error?.status === 401) return sendJson(response, 401, { authenticated: false });
    throw error;
  }
  return sendJson(response, 200, publicSession(identity));
}

export async function handleLogout(request, response) {
  allowMethods(request, response, ['POST']);
  setHeader(response, 'Set-Cookie', expiredSessionCookie());
  return sendJson(response, 200, { authenticated: false });
}

export async function handleManifest(request, response, dependencies = {}) {
  allowMethods(request, response, ['GET']);
  const authorize = dependencies.requireSession ?? requireSession;
  await authorize(request);
  return sendJson(response, 200, await currentManifest(firestoreFrom(dependencies)));
}

export async function handleMonitoring(request, response, dependencies = {}) {
  allowMethods(request, response, ['GET']);
  const authorize = dependencies.requireSession ?? requireSession;
  await authorize(request);
  const query = requestQuery(request);
  const stream = query.get('stream');
  const version = query.get('version');
  const pageToken = query.get('pageToken');
  const pageSize = STREAMS.get(stream);
  if (!pageSize) throw new HttpError(400, 'invalid-stream');
  if (!version || !DATASET_VERSION.test(version)) {
    throw new HttpError(400, 'invalid-dataset-version');
  }
  if (pageToken != null && (pageToken.length < 1 || pageToken.length > 2_048)) {
    throw new HttpError(400, 'invalid-page-token');
  }

  const firestore = firestoreFrom(dependencies);
  const manifest = await currentManifest(firestore);
  if (manifest.version !== version) {
    throw new HttpError(409, 'dataset-version-changed');
  }
  const page = await firestore.listDocuments(
    `monitoringDatasets/${version}/${stream}`,
    { pageSize, pageToken },
  );
  const payload = {
    records: page.records,
    nextPageToken: page.nextPageToken ?? null,
  };
  if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > MAX_MONITORING_RESPONSE_BYTES) {
    throw new HttpError(502, 'dataset-page-too-large');
  }
  return sendJson(response, 200, payload);
}

export const API_CONSTANTS = Object.freeze({
  monitoringResponseBytes: MAX_MONITORING_RESPONSE_BYTES,
  streamPageSizes: Object.freeze(Object.fromEntries(STREAMS)),
});
