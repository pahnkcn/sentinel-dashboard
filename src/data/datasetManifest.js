export const MONITORING_SCHEMA_VERSION = 2;
export const MONITORING_DATA_CLASSIFICATION = 'synthetic';

const DATASET_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function unwrapManifest(input) {
  if (typeof input?.exists !== 'function') return input;
  if (!input.exists()) return null;
  return input.data();
}

function normalizePublishedAt(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  if (typeof value !== 'string' || value.length > 64) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? value : null;
}

export function isSafeDatasetVersion(value) {
  return typeof value === 'string' && DATASET_VERSION_PATTERN.test(value);
}

export function decodeDatasetManifest(input) {
  let data;
  try {
    data = unwrapManifest(input);
  } catch {
    return { ok: false, error: { code: 'dataset-manifest-invalid' } };
  }

  if (data === null) {
    return { ok: false, error: { code: 'dataset-manifest-missing' } };
  }
  const publishedAt = normalizePublishedAt(data?.publishedAt);
  if (
    !isPlainObject(data)
    || !isSafeDatasetVersion(data.version)
    || data.schemaVersion !== MONITORING_SCHEMA_VERSION
    || data.dataClassification !== MONITORING_DATA_CLASSIFICATION
    || publishedAt === null
  ) {
    return { ok: false, error: { code: 'dataset-manifest-invalid' } };
  }

  return {
    ok: true,
    value: {
      version: data.version,
      schemaVersion: data.schemaVersion,
      dataClassification: data.dataClassification,
      publishedAt,
    },
  };
}
