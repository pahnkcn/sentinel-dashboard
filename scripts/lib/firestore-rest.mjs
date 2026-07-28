const DATASTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';
const DEFAULT_BATCH_SIZE = 450;
const MAX_BATCH_SIZE = 500;
const PROJECT_ID_PATTERN = /^[a-z][a-z0-9-]{4,61}[a-z0-9]$/;
const LOOPBACK_HOST_PATTERN = /^(?:127\.0\.0\.1|localhost):\d{1,5}$/;

function assertProjectId(projectId) {
  if (typeof projectId !== 'string' || !PROJECT_ID_PATTERN.test(projectId)) {
    throw new TypeError('A valid explicit Google Cloud project ID is required');
  }
  if (/^(?:your-|replace-|example)/i.test(projectId)) {
    throw new TypeError('Replace the placeholder Google Cloud project ID');
  }
  return projectId;
}

function assertLocalEmulatorTarget(projectId, host) {
  assertProjectId(projectId);
  if (!projectId.startsWith('demo-')) {
    throw new Error('Refusing local publish: emulator project ID must start with demo-');
  }
  if (typeof host !== 'string' || !LOOPBACK_HOST_PATTERN.test(host)) {
    throw new Error('Refusing local publish: Firestore emulator must use a loopback host');
  }
}

function chunkWrites(writes, batchSize = DEFAULT_BATCH_SIZE) {
  if (!Array.isArray(writes)) throw new TypeError('Writes must be an array');
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) {
    throw new RangeError(`Firestore commit batch size must be between 1 and ${MAX_BATCH_SIZE}`);
  }

  const batches = [];
  for (let offset = 0; offset < writes.length; offset += batchSize) {
    batches.push(writes.slice(offset, offset + batchSize));
  }
  return batches;
}

function toFirestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new TypeError('Firestore dates must be valid');
    return { timestampValue: value.toISOString() };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestoreValue) } };
  }

  switch (typeof value) {
    case 'string':
      return { stringValue: value };
    case 'boolean':
      return { booleanValue: value };
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError('Firestore numbers must be finite');
      return Number.isInteger(value)
        ? { integerValue: String(value) }
        : { doubleValue: value };
    case 'object':
      return {
        mapValue: {
          fields: Object.fromEntries(
            Object.entries(value).map(([key, entry]) => [key, toFirestoreValue(entry)]),
          ),
        },
      };
    default:
      throw new TypeError(`Unsupported Firestore value: ${typeof value}`);
  }
}

function documentWrite(projectId, path, data, { exists } = {}) {
  assertProjectId(projectId);
  if (typeof path !== 'string' || path.length === 0 || path.startsWith('/')) {
    throw new TypeError('Firestore document path must be a non-empty relative path');
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new TypeError('Firestore document data must be a plain object');
  }

  const write = {
    update: {
      name: `projects/${projectId}/databases/(default)/documents/${path}`,
      fields: Object.fromEntries(
        Object.entries(data).map(([key, value]) => [key, toFirestoreValue(value)]),
      ),
    },
  };
  if (typeof exists === 'boolean') write.currentDocument = { exists };
  return write;
}

async function getAdcAccessToken() {
  let GoogleAuth;
  try {
    ({ GoogleAuth } = await import('google-auth-library'));
  } catch {
    throw new Error(
      'google-auth-library is required for committed operator writes. Run npm install first.',
    );
  }

  const auth = new GoogleAuth({ scopes: [DATASTORE_SCOPE] });
  const client = await auth.getClient();
  const tokenResult = await client.getAccessToken();
  const token = typeof tokenResult === 'string' ? tokenResult : tokenResult?.token;
  if (!token) throw new Error('Application Default Credentials did not return an access token');
  return token;
}

function getFirestoreEndpoint(projectId, emulatorHost) {
  assertProjectId(projectId);
  if (emulatorHost) {
    assertLocalEmulatorTarget(projectId, emulatorHost);
    return `http://${emulatorHost}/v1/projects/${projectId}/databases/(default)/documents`;
  }
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

async function commitWrites({
  projectId,
  writes,
  emulatorHost,
  request = fetch,
  getAccessToken = getAdcAccessToken,
}) {
  if (!Array.isArray(writes) || writes.length < 1 || writes.length > MAX_BATCH_SIZE) {
    throw new RangeError(`A Firestore commit must contain between 1 and ${MAX_BATCH_SIZE} writes`);
  }
  const endpoint = getFirestoreEndpoint(projectId, emulatorHost);
  const token = emulatorHost ? 'owner' : await getAccessToken();
  let response;
  try {
    response = await request(`${endpoint}:commit`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ writes }),
    });
  } catch {
    const target = emulatorHost ? `Firestore emulator at ${emulatorHost}` : 'Firestore REST API';
    throw new Error(`Cannot reach ${target}`);
  }

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Firestore commit failed (${response.status}): ${detail.slice(0, 500)}`);
  }
  return response.json();
}

export {
  assertLocalEmulatorTarget,
  assertProjectId,
  chunkWrites,
  commitWrites,
  DATASTORE_SCOPE,
  DEFAULT_BATCH_SIZE,
  documentWrite,
  getAdcAccessToken,
  getFirestoreEndpoint,
  MAX_BATCH_SIZE,
  toFirestoreValue,
};
