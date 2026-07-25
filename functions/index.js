import { getApps, initializeApp } from 'firebase-admin/app';
import { getAppCheck } from 'firebase-admin/app-check';
import { getAuth } from 'firebase-admin/auth';
import { logger } from 'firebase-functions';
import { defineSecret, defineString } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';

import { validateChatRequest } from './chatPolicy.js';
import {
  buildPrivateModelRequest,
  mergeDeterministicEvidence,
  restoreAssistantPayload,
  validateAssistantDisclosure,
} from './privacyContext.js';
import { getVerifiedMonitoringDataset } from './monitoringRepository.js';
import {
  REQUIRED_OPENROUTER_MODEL,
  normalizeProviderOnly,
  requestOpenRouter,
  validateModelSetting,
} from './openRouterClient.js';

const OPENROUTER_API_KEY = defineSecret('OPENROUTER_API_KEY');
const OPENROUTER_MODEL = defineString('OPENROUTER_MODEL', {
  default: REQUIRED_OPENROUTER_MODEL,
});
const OPENROUTER_PROVIDER = defineString('OPENROUTER_PROVIDER', {
  default: '',
});
const ALLOWED_ROLES = new Set(['clinician', 'admin']);
const REQUEST_WINDOW_MS = 60_000;
const REQUESTS_PER_WINDOW = 8;
const rateWindows = new Map();
let nextRatePruneAt = 0;

function setResponseHeaders(response) {
  response.set('Cache-Control', 'no-store, max-age=0');
  response.set('Pragma', 'no-cache');
  response.set('X-Content-Type-Options', 'nosniff');
}

function sendError(response, status, code, retryAfter) {
  setResponseHeaders(response);
  if (retryAfter) response.set('Retry-After', String(retryAfter));
  response.status(status).json({ error: { code } });
}

function sendDeterministicFallback(response, {
  payload,
  privacy,
  externalRequestAttempted,
}) {
  setResponseHeaders(response);
  response.status(200).json({
    payload,
    model: 'Sentinel deterministic fallback',
    usage: { totalTokens: 0 },
    route: 'local-provider-fallback',
    privacy: {
      ...privacy,
      externalRequestAttempted,
    },
  });
}

function bearerToken(request) {
  const authorization = request.get('Authorization') ?? '';
  const match = authorization.match(/^Bearer ([A-Za-z0-9._~+/-]+=*)$/);
  return match?.[1] ?? null;
}

async function authorizeRequest(request) {
  const token = bearerToken(request);
  if (!token) throw Object.assign(new Error('missing-auth'), { status: 401 });

  let decoded;
  try {
    decoded = await getAuth().verifyIdToken(token);
  } catch {
    throw Object.assign(new Error('invalid-auth'), { status: 401 });
  }
  if (decoded.email_verified !== true || !ALLOWED_ROLES.has(decoded.sentinelRole)) {
    throw Object.assign(new Error('forbidden'), { status: 403 });
  }

  if (process.env.FUNCTIONS_EMULATOR !== 'true') {
    const appCheckToken = request.get('X-Firebase-AppCheck');
    if (!appCheckToken) {
      throw Object.assign(new Error('missing-app-check'), { status: 401 });
    }
    try {
      await getAppCheck().verifyToken(appCheckToken);
    } catch {
      throw Object.assign(new Error('invalid-app-check'), { status: 401 });
    }
  }

  return decoded;
}

function enforceRateLimit(uid) {
  const now = Date.now();
  if (now >= nextRatePruneAt) {
    for (const [candidateUid, window] of rateWindows) {
      if (now - window.startedAt >= REQUEST_WINDOW_MS) {
        rateWindows.delete(candidateUid);
      }
    }
    nextRatePruneAt = now + REQUEST_WINDOW_MS;
  }
  const current = rateWindows.get(uid);
  if (!current || now - current.startedAt >= REQUEST_WINDOW_MS) {
    rateWindows.set(uid, { startedAt: now, count: 1 });
    return null;
  }
  if (current.count >= REQUESTS_PER_WINDOW) {
    return Math.max(1, Math.ceil((REQUEST_WINDOW_MS - (now - current.startedAt)) / 1_000));
  }
  current.count += 1;
  return null;
}

if (getApps().length === 0) initializeApp();

export const sentinelChat = onRequest({
  region: 'asia-southeast1',
  timeoutSeconds: 90,
  memory: '1GiB',
  maxInstances: 20,
  concurrency: 4,
  secrets: [OPENROUTER_API_KEY],
}, async (request, response) => {
  setResponseHeaders(response);
  if (request.method !== 'POST') {
    response.set('Allow', 'POST');
    sendError(response, 405, 'method-not-allowed');
    return;
  }
  if (!request.is('application/json')) {
    sendError(response, 415, 'json-required');
    return;
  }

  let identity;
  try {
    identity = await authorizeRequest(request);
  } catch (error) {
    sendError(response, error.status || 401, error.message);
    return;
  }

  const retryAfter = enforceRateLimit(identity.uid);
  if (retryAfter) {
    sendError(response, 429, 'rate-limited', retryAfter);
    return;
  }

  const validated = validateChatRequest(request.body);
  if (!validated.ok) {
    sendError(response, 400, validated.code);
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 70_000);
  let deterministicFallback = null;
  let fallbackPrivacy = null;

  try {
    const dataset = await getVerifiedMonitoringDataset();
    if (dataset.version !== validated.value.expectedDatasetVersion) {
      sendError(response, 409, 'chat-stale-dataset');
      return;
    }
    const privateRequest = buildPrivateModelRequest({
      dataset,
      messages: validated.value.messages,
    });
    if (privateRequest.localPayload) {
      response.status(200).json({
        payload: privateRequest.localPayload,
        model: privateRequest.requestType === 'local-derived'
          ? 'Sentinel deterministic analysis'
          : 'Sentinel privacy policy',
        usage: { totalTokens: 0 },
        route: privateRequest.requestType,
        privacy: {
          disclosureBytes: 0,
          directIdentifiersSent: false,
          externalRequestAttempted: false,
        },
      });
      return;
    }
    deterministicFallback = privateRequest.fallbackPayload;
    fallbackPrivacy = {
      requestType: privateRequest.requestType,
      disclosureBytes: privateRequest.disclosureBytes,
      directIdentifiersSent: false,
    };

    const apiKey = OPENROUTER_API_KEY.value();
    if (!apiKey) {
      logger.error('Sentinel chat secret is unavailable');
      sendDeterministicFallback(response, {
        payload: deterministicFallback,
        privacy: fallbackPrivacy,
        externalRequestAttempted: false,
      });
      return;
    }

    const result = await requestOpenRouter({
      apiKey,
      messages: privateRequest.messages,
      contextJson: privateRequest.contextJson,
      model: validateModelSetting(OPENROUTER_MODEL.value()),
      providerOnly: normalizeProviderOnly(OPENROUTER_PROVIDER.value()),
      signal: controller.signal,
    });
    result.payload = restoreAssistantPayload(
      mergeDeterministicEvidence(
        validateAssistantDisclosure(result.payload, privateRequest.context, dataset),
        privateRequest.fallbackPayload,
      ),
      privateRequest.restoreText,
    );
    result.privacy = {
      requestType: privateRequest.requestType,
      disclosureBytes: privateRequest.disclosureBytes,
      directIdentifiersSent: false,
      externalRequestAttempted: true,
    };

    response.status(200).json(result);
  } catch (error) {
    if (deterministicFallback) {
      logger.warn('Sentinel chat used deterministic provider fallback', {
        category: error?.publicCode === 'chat-config-invalid'
          ? 'configuration'
          : error?.publicCode
            ? 'model-response'
            : 'provider',
        stage: error?.stage ?? null,
        status: Number.isFinite(Number(error?.status)) ? Number(error.status) : null,
      });
      sendDeterministicFallback(response, {
        payload: deterministicFallback,
        privacy: fallbackPrivacy,
        externalRequestAttempted: error?.publicCode !== 'chat-config-invalid',
      });
      return;
    }
    if (error?.publicCode) {
      const isConfiguration = error.publicCode === 'chat-config-invalid';
      const isDataFailure = error.publicCode === 'chat-data-unavailable';
      const isPrivacyBlock = error.publicCode === 'chat-privacy-blocked';
      logger.error(
        isConfiguration
          ? 'Sentinel chat configuration is invalid'
          : isDataFailure
            ? 'Sentinel chat verified dataset is unavailable'
            : isPrivacyBlock
              ? 'Sentinel chat request was blocked by disclosure policy'
          : 'Sentinel chat model response is incomplete',
        {
          category: isConfiguration
            ? 'configuration'
            : isDataFailure
              ? 'retrieval'
              : isPrivacyBlock
                ? 'privacy'
                : 'model-response',
          stage: error?.stage ?? null,
        },
      );
      sendError(
        response,
        isConfiguration || isDataFailure ? 503 : isPrivacyBlock ? 400 : 502,
        error.publicCode,
      );
      return;
    }
    const isTimeout = error?.name === 'AbortError';
    const providerStatus = Number(error?.status);
    const retryable = providerStatus === 429 || providerStatus === 503;
    logger.error('Sentinel chat request failed', {
      category: isTimeout ? 'timeout' : 'provider',
      stage: error?.stage ?? null,
      status: Number.isFinite(providerStatus) ? providerStatus : null,
      providerCode: error?.providerCode ?? null,
    });
    sendError(
      response,
      isTimeout ? 504 : retryable ? 503 : 502,
      isTimeout ? 'chat-timeout' : retryable ? 'chat-busy' : 'chat-unavailable',
      retryable ? Number(error?.retryAfter) || undefined : undefined,
    );
  } finally {
    clearTimeout(timeout);
  }
});
