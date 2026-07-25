import { isSafeDatasetVersion } from './datasetManifest.js';

export const MONITORING_STREAMS = Object.freeze(['students', 'logs', 'assessments']);

function perStream(factory) {
  return Object.fromEntries(MONITORING_STREAMS.map(stream => [stream, factory(stream)]));
}

function initialState(status = 'idle') {
  return {
    status,
    datasetVersion: null,
    students: [],
    logs: [],
    assessments: [],
    issues: perStream(() => []),
    integrityIssues: perStream(() => []),
    errors: perStream(() => null),
    loading: perStream(() => true),
    truncated: perStream(() => false),
    issueCount: 0,
    truncatedStreams: [],
    lastUpdatedAt: null,
  };
}

function isKnownStream(stream) {
  return MONITORING_STREAMS.includes(stream);
}

function publicStreamError(stream, error) {
  const candidateCode = typeof error?.code === 'string' ? error.code : 'unknown';
  const code = /^[a-z0-9/_-]{1,80}$/i.test(candidateCode) ? candidateCode : 'unknown';
  return {
    code,
    message: `ไม่สามารถโหลดข้อมูล ${stream} ได้`,
  };
}

function deriveIntegrityIssues(state, isLoaded) {
  const integrityIssues = perStream(() => []);
  if (!isLoaded) return integrityIssues;

  const studentIds = new Set(state.students.map(student => student.id));
  for (const stream of ['logs', 'assessments']) {
    integrityIssues[stream] = state[stream]
      .filter(record => !studentIds.has(record.studentId))
      .map(record => ({
        documentId: record.id,
        issues: [{ field: 'studentId', message: 'must reference a loaded student' }],
      }));
  }
  return integrityIssues;
}

function deriveState(state) {
  const truncatedStreams = MONITORING_STREAMS.filter(stream => state.truncated[stream]);
  const hasError = MONITORING_STREAMS.some(stream => state.errors[stream] !== null);
  const isLoaded = MONITORING_STREAMS.every(stream => !state.loading[stream]);
  const integrityIssues = deriveIntegrityIssues(state, isLoaded);
  const issueCount = MONITORING_STREAMS.reduce(
    (total, stream) => (
      total + state.issues[stream].length + integrityIssues[stream].length
    ),
    0,
  );
  let status = 'connecting';
  if (hasError) status = 'error';
  else if (isLoaded && (issueCount > 0 || truncatedStreams.length > 0)) status = 'degraded';
  else if (isLoaded) status = 'ready';

  return {
    ...state,
    status,
    issueCount,
    integrityIssues,
    truncatedStreams,
  };
}

function normalizePayload(payload) {
  return {
    records: Array.isArray(payload?.records) ? payload.records : [],
    issues: Array.isArray(payload?.issues) ? payload.issues : [],
    truncated: payload?.truncated === true,
  };
}

function isCompleteDataset(dataset) {
  return (
    isSafeDatasetVersion(dataset?.version)
    && Number.isFinite(dataset?.verifiedAt)
    && dataset.streams !== null
    && typeof dataset.streams === 'object'
    && MONITORING_STREAMS.every(stream => (
      Object.hasOwn(dataset.streams, stream)
      && Array.isArray(dataset.streams[stream]?.records)
      && Array.isArray(dataset.streams[stream]?.issues)
      && typeof dataset.streams[stream]?.truncated === 'boolean'
    ))
  );
}

export function createMonitoringDataStore(adapter) {
  if (!adapter || typeof adapter.connect !== 'function') {
    throw new TypeError('monitoring data adapter must provide connect(observer)');
  }

  let state = initialState();
  let listeners = new Set();
  let disconnectAdapter = null;
  let generation = 0;

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const setState = nextState => {
    state = nextState;
    emit();
  };

  const stop = () => {
    generation += 1;
    const disconnect = disconnectAdapter;
    disconnectAdapter = null;
    if (typeof disconnect === 'function') disconnect();
    state = initialState();
  };

  const start = () => {
    if (disconnectAdapter) return;

    const connectionGeneration = ++generation;
    state = initialState('connecting');
    emit();

    const observer = {
      beginDataset(version) {
        if (generation !== connectionGeneration) return;
        if (!isSafeDatasetVersion(version)) {
          const versionError = publicStreamError('dataset', {
            code: 'dataset-version-invalid',
          });
          setState({
            ...initialState('error'),
            errors: perStream(() => versionError),
          });
          return;
        }
        setState({
          ...initialState('connecting'),
          datasetVersion: version,
        });
      },
      replaceDataset(dataset) {
        if (
          generation !== connectionGeneration
          || dataset?.version !== state.datasetVersion
        ) return;
        if (!isCompleteDataset(dataset)) {
          const datasetError = publicStreamError('dataset', {
            code: 'atomic-dataset-invalid',
          });
          setState(deriveState({
            ...state,
            errors: perStream(() => datasetError),
          }));
          return;
        }

        const nextState = {
          ...initialState('connecting'),
          datasetVersion: dataset.version,
          lastUpdatedAt: dataset.verifiedAt,
          loading: perStream(() => false),
        };

        for (const stream of MONITORING_STREAMS) {
          const payload = normalizePayload(dataset.streams?.[stream]);
          nextState[stream] = payload.records;
          nextState.issues[stream] = payload.issues;
          nextState.truncated[stream] = payload.truncated;
        }
        setState(deriveState(nextState));
      },
      verified(stream) {
        if (
          generation !== connectionGeneration
          || !isKnownStream(stream)
          || state.errors[stream] === null
        ) return;

        setState(deriveState({
          ...state,
          errors: { ...state.errors, [stream]: null },
        }));
      },
      error(stream, error) {
        if (generation !== connectionGeneration || !isKnownStream(stream)) return;

        setState(deriveState({
          ...state,
          errors: { ...state.errors, [stream]: publicStreamError(stream, error) },
        }));
      },
    };

    try {
      const disconnect = adapter.connect(observer);
      let disconnected = false;
      disconnectAdapter = () => {
        if (disconnected) return;
        disconnected = true;
        if (typeof disconnect === 'function') disconnect();
      };
    } catch (error) {
      const connectionError = publicStreamError('connection', error);
      setState({
        ...initialState('error'),
        errors: perStream(() => connectionError),
      });
    }
  };

  return {
    getSnapshot() {
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) start();

      let subscribed = true;
      return () => {
        if (!subscribed) return;
        subscribed = false;
        listeners.delete(listener);
        if (listeners.size === 0) stop();
      };
    },
    retry() {
      if (listeners.size === 0) return;
      stop();
      start();
    },
  };
}
