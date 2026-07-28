export class HttpError extends Error {
  constructor(status, code, options = {}) {
    super(code, options);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.retryAfter = options.retryAfter;
  }
}

export function asHttpError(error, fallback = {}) {
  if (error instanceof HttpError) return error;
  return new HttpError(
    fallback.status ?? 500,
    fallback.code ?? 'internal-error',
    { cause: error },
  );
}
