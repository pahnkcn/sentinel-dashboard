import { HttpError } from './errors.js';

const STS_URL = 'https://sts.googleapis.com/v1/token';
const FEDERATION_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const FIRESTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';
const TOKEN_EXCHANGE_GRANT = 'urn:ietf:params:oauth:grant-type:token-exchange';
const ACCESS_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:access_token';
const JWT_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:jwt';

function requiredSetting(value, pattern) {
  const setting = typeof value === 'string' ? value.trim() : '';
  if (!setting || (pattern && !pattern.test(setting))) {
    throw new HttpError(503, 'firestore-auth-not-configured');
  }
  return setting;
}

function identityConfig(env) {
  const projectNumber = requiredSetting(env.GCP_PROJECT_NUMBER, /^\d{4,20}$/u);
  const pool = requiredSetting(env.GCP_WORKLOAD_IDENTITY_POOL_ID, /^[A-Za-z0-9_-]{1,128}$/u);
  const provider = requiredSetting(
    env.GCP_WORKLOAD_IDENTITY_PROVIDER_ID,
    /^[A-Za-z0-9_-]{1,128}$/u,
  );
  const serviceAccount = requiredSetting(
    env.GCP_SERVICE_ACCOUNT_EMAIL,
    /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.iam\.gserviceaccount\.com$/u,
  );
  const oidcToken = requiredSetting(env.VERCEL_OIDC_TOKEN);
  return {
    audience: `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${pool}/providers/${provider}`,
    oidcToken,
    serviceAccount,
  };
}

async function parseTokenResponse(response, code) {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new HttpError(503, code);
  return body;
}

export function createGcpAccessTokenProvider({
  env = process.env,
  fetchImpl = fetch,
  now = Date.now,
} = {}) {
  let cache = null;
  let pending = null;

  async function refresh() {
    const config = identityConfig(env);
    let stsResponse;
    try {
      stsResponse = await fetchImpl(STS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          audience: config.audience,
          grant_type: TOKEN_EXCHANGE_GRANT,
          requested_token_type: ACCESS_TOKEN_TYPE,
          scope: FEDERATION_SCOPE,
          subject_token_type: JWT_TOKEN_TYPE,
          subject_token: config.oidcToken,
        }).toString(),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw new HttpError(503, 'firestore-auth-unavailable', { cause: error });
    }
    const exchanged = await parseTokenResponse(stsResponse, 'firestore-auth-unavailable');
    if (typeof exchanged?.access_token !== 'string' || !exchanged.access_token) {
      throw new HttpError(503, 'firestore-auth-unavailable');
    }

    const account = encodeURIComponent(config.serviceAccount);
    let iamResponse;
    try {
      iamResponse = await fetchImpl(
        `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${account}:generateAccessToken`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${exchanged.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ scope: [FIRESTORE_SCOPE], lifetime: '3600s' }),
          signal: AbortSignal.timeout(10_000),
        },
      );
    } catch (error) {
      throw new HttpError(503, 'firestore-auth-unavailable', { cause: error });
    }
    const impersonated = await parseTokenResponse(iamResponse, 'firestore-auth-unavailable');
    const expiresAt = Date.parse(impersonated?.expireTime);
    if (
      typeof impersonated?.accessToken !== 'string'
      || !impersonated.accessToken
      || !Number.isFinite(expiresAt)
    ) {
      throw new HttpError(503, 'firestore-auth-unavailable');
    }
    cache = { token: impersonated.accessToken, expiresAt };
    return cache.token;
  }

  return async function accessToken() {
    if (cache && cache.expiresAt - now() > 60_000) return cache.token;
    if (!pending) {
      pending = refresh().finally(() => {
        pending = null;
      });
    }
    return pending;
  };
}

let defaultProvider;

export function getGcpAccessToken() {
  if (!defaultProvider) defaultProvider = createGcpAccessTokenProvider();
  return defaultProvider();
}
