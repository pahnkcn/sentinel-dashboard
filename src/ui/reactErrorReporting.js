const REACT_FAILURE_MESSAGES = Object.freeze({
  caught: 'React render failure: caught',
  recoverable: 'React render failure: recoverable',
  uncaught: 'React render failure: uncaught',
});

export function getReactFailureMessage(kind) {
  return REACT_FAILURE_MESSAGES[kind] ?? 'React render failure: unknown';
}

export function reportReactFailure(kind) {
  console.error(getReactFailureMessage(kind));
}
