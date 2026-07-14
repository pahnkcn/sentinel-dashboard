import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const FIREBASE_CONFIG_URL = new URL('../../firebase.json', import.meta.url);

async function getHostingHeaders() {
  const config = JSON.parse(await readFile(FIREBASE_CONFIG_URL, 'utf8'));
  const catchAll = config.hosting.headers.find(entry => entry.source === '**');
  return Object.fromEntries(catchAll.headers.map(header => [header.key, header.value]));
}

function getDirective(policy, name) {
  return policy
    .split(';')
    .map(directive => directive.trim())
    .find(directive => directive.startsWith(`${name} `));
}

test('hosting applies baseline browser security headers to every route', async () => {
  const headers = await getHostingHeaders();

  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.match(headers['Strict-Transport-Security'], /max-age=63072000/);
  assert.match(headers['Permissions-Policy'], /camera=\(\)/);
  assert.equal(headers['Cross-Origin-Opener-Policy'], 'same-origin-allow-popups');
});

test('script policy blocks inline execution and permits App Check Enterprise', async () => {
  const headers = await getHostingHeaders();
  const policy = headers['Content-Security-Policy'];
  const scriptPolicy = getDirective(policy, 'script-src');

  assert.match(policy, /object-src 'none'/);
  assert.match(policy, /frame-ancestors 'none'/);
  assert.match(scriptPolicy, /https:\/\/www\.google\.com\/recaptcha\//);
  assert.doesNotMatch(scriptPolicy, /'unsafe-inline'|'unsafe-eval'/);
});
