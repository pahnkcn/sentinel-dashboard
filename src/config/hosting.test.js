import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const VERCEL_CONFIG_URL = new URL('../../vercel.json', import.meta.url);
const FIREBASE_CONFIG_URL = new URL('../../firebase.json', import.meta.url);

async function readJson(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}

function getHeaderMap(config) {
  const catchAll = config.headers.find(entry => entry.source === '/(.*)');
  return Object.fromEntries(catchAll.headers.map(header => [header.key, header.value]));
}

function getDirective(policy, name) {
  return policy
    .split(';')
    .map(directive => directive.trim())
    .find(directive => directive.startsWith(`${name} `));
}

test('Vercel deploys the Vite build in Singapore with Fluid Compute', async () => {
  const config = await readJson(VERCEL_CONFIG_URL);

  assert.equal(config.framework, 'vite');
  assert.equal(config.outputDirectory, 'dist');
  assert.deepEqual(config.regions, ['sin1']);
  assert.equal(config.fluid, true);
  assert.equal(config.functions['api/chat.js'].maxDuration, 90);
  assert.equal(config.functions['api/auth/*.js'].maxDuration, 15);
  assert.equal(config.functions['api/manifest.js'].maxDuration, 15);
  assert.equal(config.functions['api/monitoring.js'].maxDuration, 15);
});

test('Vercel applies baseline browser security headers to every route', async () => {
  const headers = getHeaderMap(await readJson(VERCEL_CONFIG_URL));

  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.match(headers['Strict-Transport-Security'], /max-age=63072000/);
  assert.match(headers['Permissions-Policy'], /camera=\(\)/);
  assert.equal(headers['Cross-Origin-Opener-Policy'], 'same-origin-allow-popups');
  assert.equal(headers['X-Robots-Tag'], 'noindex, nofollow, noarchive');
});

test('content policy permits GIS but removes Firebase and App Check origins', async () => {
  const headers = getHeaderMap(await readJson(VERCEL_CONFIG_URL));
  const policy = headers['Content-Security-Policy'];
  const scriptPolicy = getDirective(policy, 'script-src');

  assert.match(policy, /object-src 'none'/);
  assert.match(policy, /frame-ancestors 'none'/);
  assert.match(scriptPolicy, /https:\/\/accounts\.google\.com/);
  assert.doesNotMatch(scriptPolicy, /'unsafe-inline'|'unsafe-eval'/);
  assert.doesNotMatch(policy, /firebase|recaptcha|gstatic/i);
});

test('SPA fallback explicitly excludes same-origin API routes', async () => {
  const config = await readJson(VERCEL_CONFIG_URL);

  assert.deepEqual(config.rewrites, [{
    source: '/:path((?!api(?:/|$)).*)',
    destination: '/index.html',
  }]);
});

test('Firebase config retains only Firestore rules and the local emulator', async () => {
  const config = await readJson(FIREBASE_CONFIG_URL);

  assert.deepEqual(Object.keys(config).sort(), ['emulators', 'firestore']);
  assert.equal(config.firestore.rules, 'firestore.rules');
  assert.deepEqual(config.emulators.firestore, {
    host: '127.0.0.1',
    port: 8080,
  });
  assert.equal(config.emulators.singleProjectMode, true);
  assert.equal(config.hosting, undefined);
  assert.equal(config.functions, undefined);
  assert.equal(config.emulators.auth, undefined);
  assert.equal(config.emulators.functions, undefined);
});
