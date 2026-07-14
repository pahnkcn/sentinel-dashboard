export const MONITORING_STREAMS = Object.freeze(['students', 'logs', 'assessments']);

function perStream(factory) {
  return Object.fromEntries(MONITORING_STREAMS.map(stream => [stream, factory(stream)]));
}

function initialState(status = 'idle') {
  return {
    status,
    students: [],
    logs: [],
    assessments: [],
    issues: perStream(() => []),
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

function deriveState(state) {
  const issueCount = MONITORING_STREAMS.reduce(
    (total, stream) => total + state.issues[stream].length,
    0,
  );
  const truncatedStreams = MONITORING_STREAMS.filter(stream => state.truncated[stream]);
  const hasError = MONITORING_STREAMS.some(stream => state.errors[stream] !== null);
  const isLoaded = MONITORING_STREAMS.every(stream => !state.loading[stream]);
  const timestamps = MONITORING_STREAMS
    .map(stream => state[`${stream}UpdatedAt`])
    .filter(value => Number.isFinite(value));

  let status = 'connecting';
  if (hasError) status = 'error';
  else if (isLoaded && (issueCount > 0 || truncatedStreams.length > 0)) status = 'degraded';
  else if (isLoaded) status = 'ready';

  return {
    ...state,
    status,
    issueCount,
    truncatedStreams,
    lastUpdatedAt: timestamps.length > 0 ? Math.max(...timestamps) : null,
  };
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
      next(stream, payload) {
        if (generation !== connectionGeneration || !isKnownStream(stream)) return;

        const records = Array.isArray(payload?.records) ? payload.records : [];
        const issues = Array.isArray(payload?.issues) ? payload.issues : [];
        const receivedAt = Number.isFinite(payload?.receivedAt)
          ? payload.receivedAt
          : Date.now();

        setState(deriveState({
          ...state,
          [stream]: records,
          [`${stream}UpdatedAt`]: receivedAt,
          issues: { ...state.issues, [stream]: issues },
          errors: { ...state.errors, [stream]: null },
          loading: { ...state.loading, [stream]: false },
          truncated: { ...state.truncated, [stream]: payload?.truncated === true },
        }));
      },
      error(stream, error) {
        if (generation !== connectionGeneration || !isKnownStream(stream)) return;

        setState(deriveState({
          ...state,
          errors: { ...state.errors, [stream]: publicStreamError(stream, error) },
          loading: { ...state.loading, [stream]: false },
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
  };
}
