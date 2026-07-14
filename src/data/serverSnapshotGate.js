export const SERVER_VERIFICATION_TIMEOUT_MS = 15_000;

export function createServerSnapshotGate({
  onUnverified,
  timeoutMs = SERVER_VERIFICATION_TIMEOUT_MS,
  scheduleTimeout = setTimeout,
  cancelTimeout = clearTimeout,
} = {}) {
  if (typeof onUnverified !== 'function') {
    throw new TypeError('server snapshot gate requires onUnverified(error)');
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError('server snapshot timeout must be a positive number');
  }

  let closed = false;
  let status = 'waiting';
  let timer = null;
  timer = scheduleTimeout(() => {
    timer = null;
    if (closed || status !== 'waiting') return;
    status = 'unverified';
    onUnverified({ code: 'server-verification-timeout' });
  }, timeoutMs);

  const cancelVerificationTimeout = () => {
    if (timer === null) return;
    cancelTimeout(timer);
    timer = null;
  };

  return {
    accept(fromCache) {
      if (closed) return false;

      if (fromCache !== false) {
        if (status === 'verified') {
          status = 'unverified';
          onUnverified({ code: 'snapshot-from-cache' });
        }
        return false;
      }

      cancelVerificationTimeout();
      status = 'verified';
      return true;
    },
    close() {
      if (closed) return;
      closed = true;
      cancelVerificationTimeout();
    },
  };
}
