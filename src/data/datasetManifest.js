const DATASET_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function isSafeDatasetVersion(value) {
  return typeof value === 'string' && DATASET_VERSION_PATTERN.test(value);
}

export function decodeDatasetManifest(snapshot) {
  if (typeof snapshot?.exists !== 'function' || !snapshot.exists()) {
    return { ok: false, error: { code: 'dataset-manifest-missing' } };
  }

  let data;
  try {
    data = snapshot.data();
  } catch {
    return { ok: false, error: { code: 'dataset-manifest-invalid' } };
  }

  if (!isPlainObject(data) || !isSafeDatasetVersion(data.version)) {
    return { ok: false, error: { code: 'dataset-manifest-invalid' } };
  }

  return { ok: true, value: { version: data.version } };
}
