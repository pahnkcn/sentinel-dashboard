import { Buffer } from 'node:buffer';

import { HttpError, asHttpError } from './errors.js';

const JSON_CONTENT_TYPE = /^application\/json(?:\s*;|$)/iu;

export function requestHeader(request, name) {
  if (typeof request?.get === 'function') {
    const value = request.get(name);
    if (value != null) return Array.isArray(value) ? value[0] : String(value);
  }
  const headers = request?.headers ?? {};
  const value = headers[name.toLowerCase()] ?? headers[name] ?? headers[
    Object.keys(headers).find(key => key.toLowerCase() === name.toLowerCase())
  ];
  return Array.isArray(value) ? value[0] : value == null ? null : String(value);
}

export function setHeader(response, name, value) {
  if (typeof response.setHeader === 'function') response.setHeader(name, value);
  else if (typeof response.set === 'function') response.set(name, value);
  return response;
}

export function setPrivateNoStore(response) {
  setHeader(response, 'Cache-Control', 'private, no-store, max-age=0');
  setHeader(response, 'Pragma', 'no-cache');
  setHeader(response, 'X-Content-Type-Options', 'nosniff');
  return response;
}

export function sendJson(response, status, body) {
  setPrivateNoStore(response);
  if (typeof response.status === 'function' && typeof response.json === 'function') {
    return response.status(status).json(body);
  }
  response.statusCode = status;
  setHeader(response, 'Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
  return response;
}

export function sendApiError(response, error, fallback) {
  const resolved = asHttpError(error, fallback);
  if (resolved.retryAfter != null) {
    setHeader(response, 'Retry-After', String(resolved.retryAfter));
  }
  return sendJson(response, resolved.status, { error: { code: resolved.code } });
}

export function methodIs(request, method) {
  return String(request?.method ?? '').toUpperCase() === method;
}

export function allowMethods(request, response, methods) {
  if (methods.includes(String(request?.method ?? '').toUpperCase())) return;
  setHeader(response, 'Allow', methods.join(', '));
  throw new HttpError(405, 'method-not-allowed');
}

export function isJsonRequest(request) {
  if (typeof request?.is === 'function' && request.is('application/json')) return true;
  return JSON_CONTENT_TYPE.test(requestHeader(request, 'content-type') ?? '');
}

export function readJsonBody(request, maxBytes = 16_384) {
  if (!isJsonRequest(request)) throw new HttpError(415, 'json-required');
  const advertisedLength = Number(requestHeader(request, 'content-length'));
  if (Number.isFinite(advertisedLength) && advertisedLength > maxBytes) {
    throw new HttpError(413, 'request-too-large');
  }
  let value = request?.body;
  if (Buffer.isBuffer(value)) value = value.toString('utf8');
  if (typeof value === 'string') {
    if (Buffer.byteLength(value, 'utf8') > maxBytes) {
      throw new HttpError(413, 'request-too-large');
    }
    try {
      value = JSON.parse(value);
    } catch {
      throw new HttpError(400, 'invalid-json');
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'invalid-body');
  }
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > maxBytes) {
    throw new HttpError(413, 'request-too-large');
  }
  return value;
}

export function parseCookies(request) {
  const header = requestHeader(request, 'cookie') ?? '';
  const result = Object.create(null);
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    const rawValue = part.slice(separator + 1).trim();
    if (!name || Object.hasOwn(result, name)) continue;
    try {
      result[name] = decodeURIComponent(rawValue);
    } catch {
      result[name] = rawValue;
    }
  }
  return result;
}

export function requestQuery(request) {
  const rawUrl = typeof request?.url === 'string' ? request.url : '/';
  return new URL(rawUrl, 'http://localhost').searchParams;
}

export function createApiHandler(handler, defaultDependencies = {}) {
  return async function apiHandler(request, response) {
    setPrivateNoStore(response);
    try {
      await handler(request, response, defaultDependencies);
    } catch (error) {
      if (!(error instanceof HttpError)) {
        console.error('Unhandled Sentinel API error', {
          name: error?.name,
          message: error?.message,
        });
      }
      if (!response.headersSent) sendApiError(response, error);
    }
  };
}
