import { HttpError } from './errors.js';
import { getGcpAccessToken } from './gcpOidc.js';

const PROJECT_ID = /^[a-z][a-z0-9-]{3,61}[a-z0-9]$/u;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function safePageToken(value) {
  return typeof value === 'string'
    && value.length >= 1
    && value.length <= 4_096
    && [...value].every(character => {
      const code = character.codePointAt(0);
      return code > 31 && code !== 127;
    });
}

function projectIdFrom(env) {
  const projectId = typeof env.GCP_PROJECT_ID === 'string' ? env.GCP_PROJECT_ID.trim() : '';
  if (!PROJECT_ID.test(projectId)) throw new HttpError(503, 'firestore-not-configured');
  return projectId;
}

export function validateFirestoreEmulator(env = process.env) {
  const rawHost = typeof env.FIRESTORE_EMULATOR_HOST === 'string'
    ? env.FIRESTORE_EMULATOR_HOST.trim()
    : '';
  if (!rawHost) return null;
  const projectId = projectIdFrom(env);
  let url;
  try {
    url = new URL(`http://${rawHost}`);
  } catch {
    throw new HttpError(503, 'unsafe-firestore-emulator');
  }
  if (
    !projectId.startsWith('demo-')
    || !LOOPBACK_HOSTS.has(url.hostname)
    || url.protocol !== 'http:'
    || !url.port
    || url.username
    || url.password
    || url.pathname !== '/'
    || url.search
    || url.hash
  ) {
    throw new HttpError(503, 'unsafe-firestore-emulator');
  }
  return { origin: url.origin, projectId };
}

function encodeDocumentPath(path) {
  if (typeof path !== 'string') throw new TypeError('Firestore path must be a string');
  const segments = path.split('/');
  if (
    segments.length === 0
    || segments.some(segment => !segment || segment === '.' || segment === '..')
  ) {
    throw new TypeError('Firestore path contains an invalid segment');
  }
  return segments.map(encodeURIComponent).join('/');
}

export function firestoreValueToJson(value) {
  if (!value || typeof value !== 'object') return null;
  if (Object.hasOwn(value, 'nullValue')) return null;
  if (Object.hasOwn(value, 'stringValue')) return String(value.stringValue);
  if (Object.hasOwn(value, 'booleanValue')) return Boolean(value.booleanValue);
  if (Object.hasOwn(value, 'integerValue')) {
    const parsed = Number(value.integerValue);
    return Number.isSafeInteger(parsed) ? parsed : String(value.integerValue);
  }
  if (Object.hasOwn(value, 'doubleValue')) {
    const parsed = Number(value.doubleValue);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (Object.hasOwn(value, 'timestampValue')) return String(value.timestampValue);
  if (Object.hasOwn(value, 'bytesValue')) return String(value.bytesValue);
  if (Object.hasOwn(value, 'referenceValue')) return String(value.referenceValue);
  if (Object.hasOwn(value, 'geoPointValue')) {
    return {
      latitude: Number(value.geoPointValue?.latitude),
      longitude: Number(value.geoPointValue?.longitude),
    };
  }
  if (Object.hasOwn(value, 'arrayValue')) {
    return Array.isArray(value.arrayValue?.values)
      ? value.arrayValue.values.map(firestoreValueToJson)
      : [];
  }
  if (Object.hasOwn(value, 'mapValue')) {
    return firestoreFieldsToJson(value.mapValue?.fields ?? {});
  }
  return null;
}

export function firestoreFieldsToJson(fields) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return {};
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, firestoreValueToJson(value)]),
  );
}

export function firestoreDocumentToJson(document) {
  const name = typeof document?.name === 'string' ? document.name : '';
  const id = name.slice(name.lastIndexOf('/') + 1);
  if (!id) throw new HttpError(503, 'firestore-invalid-response');
  return { ...firestoreFieldsToJson(document.fields), id };
}

export function createFirestoreRestClient({
  env = process.env,
  fetchImpl = fetch,
  getAccessToken = getGcpAccessToken,
} = {}) {
  const emulator = validateFirestoreEmulator(env);
  const projectId = emulator?.projectId ?? projectIdFrom(env);
  if (!emulator && env.VERCEL === '1' && env.VERCEL_ENV !== 'production') {
    throw new HttpError(503, 'firestore-preview-disabled');
  }
  const origin = emulator?.origin ?? 'https://firestore.googleapis.com';
  const root = `${origin}/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents`;

  async function request(path, searchParams) {
    const url = new URL(`${root}/${encodeDocumentPath(path)}`);
    for (const [key, value] of searchParams ?? []) {
      if (value != null && value !== '') url.searchParams.append(key, String(value));
    }
    const headers = { Accept: 'application/json' };
    // The deny-all Firestore Rules must remain active for browser clients.
    // `Bearer owner` is the Emulator's local admin identity and is reachable
    // only after validateFirestoreEmulator has enforced demo-* + loopback.
    headers.Authorization = emulator
      ? 'Bearer owner'
      : `Bearer ${await getAccessToken()}`;
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(12_000),
      });
    } catch (error) {
      throw new HttpError(503, 'firestore-unavailable', { cause: error });
    }
    if (response.status === 404) return { missing: true, body: null };
    const body = await response.json().catch(() => null);
    if (!response.ok || !body) throw new HttpError(503, 'firestore-unavailable');
    return { missing: false, body };
  }

  return {
    async getDocument(documentPath) {
      const result = await request(documentPath);
      return result.missing ? null : firestoreDocumentToJson(result.body);
    },

    async listDocuments(collectionPath, {
      pageSize = 100,
      pageToken = null,
    } = {}) {
      if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1_000) {
        throw new TypeError('Firestore pageSize must be between 1 and 1000');
      }
      if (pageToken != null && !safePageToken(pageToken)) {
        throw new HttpError(400, 'invalid-page-token');
      }
      const result = await request(collectionPath, [
        ['pageSize', pageSize],
        ['pageToken', pageToken],
        ['orderBy', '__name__'],
        ['showMissing', 'false'],
      ]);
      if (result.missing) return { records: [], nextPageToken: null };
      const documents = Array.isArray(result.body.documents) ? result.body.documents : [];
      return {
        records: documents.map(firestoreDocumentToJson),
        nextPageToken: typeof result.body.nextPageToken === 'string'
          && result.body.nextPageToken
          ? result.body.nextPageToken
          : null,
      };
    },
  };
}

let sharedClient;

export function getFirestoreClient() {
  if (!sharedClient) sharedClient = createFirestoreRestClient();
  return sharedClient;
}
