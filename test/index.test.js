import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import worker, { handleRequest, testInternals } from '../src/index.js';

const fixture = readFileSync(new URL('./fixtures/process-response-ok.xml', import.meta.url), 'utf8');
const env = { ADDRESS_DOCTOR_LOGIN: 'id', ADDRESS_DOCTOR_PASSWORD: 'pw', ADDRESS_DOCTOR_TIMEOUT_MS: '100' };
const origin = 'https://uat.vitamix.com';

function request(path = '/places/validate', init = {}) {
  return new Request(`https://worker.test${path}`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', ...(init.headers || {}) },
    body: JSON.stringify({ address: { addressLines: ['100 Park St', 'New York, NY 10005'], regionCode: 'US' } }),
    ...init,
  });
}

test('handles successful validation and adds cors headers', async () => {
  const response = await handleRequest(request(), env, async () => new Response(fixture));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const body = await response.json();
  assert.equal(body.action, 'CONFIRM');
});

test('default export delegates to handleRequest', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(fixture);
  try {
    const response = await worker.fetch(request(), env);
    assert.equal(response.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects disallowed origin before route handling', async () => {
  const response = await handleRequest(request('/places/validate', { headers: { Origin: 'https://evil.test' } }), env, async () => new Response(fixture));
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  assert.deepEqual(await response.json(), { error: 'forbidden' });
});

test('handles options preflight for allowed origin', async () => {
  const response = await handleRequest(new Request('https://worker.test/places/validate', { method: 'OPTIONS', headers: { Origin: origin } }), env);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
});

test('returns 404 with cors for unknown route', async () => {
  const response = await handleRequest(request('/bad'), env);
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
});

test('returns 405 with cors for wrong method', async () => {
  const response = await handleRequest(request('/places/validate', { method: 'GET', body: undefined }), env);
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
});

test('returns 400 for invalid JSON, oversized body, invalid lines, and invalid components', async () => {
  let response = await handleRequest(new Request('https://worker.test/places/validate', { method: 'POST', headers: { Origin: origin }, body: '{' }), env);
  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /valid JSON/);

  response = await handleRequest(new Request('https://worker.test/places/validate', { method: 'POST', headers: { Origin: origin }, body: 'x'.repeat(8193) }), env);
  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /too large/);

  response = await handleRequest(request('/places/validate', { body: JSON.stringify({ address: { addressLines: [] } }) }), env);
  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /non-empty array/);

  response = await handleRequest(request('/places/validate', { body: JSON.stringify({ address: { addressLines: ['x'], components: [] } }) }), env);
  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /components/);
});

test('returns 500 when configuration is missing', async () => {
  const response = await handleRequest(request(), {}, async () => new Response(fixture));
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.error, 'misconfigured');
  assert.ok(body.requestId);
});

test('returns 502 when fetch throws, upstream is non-ok, or response cannot parse', async () => {
  let response = await handleRequest(request(), env, async () => { throw new Error('network'); });
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error, 'upstream_error');

  response = await handleRequest(request(), env, async () => new Response('bad', { status: 500 }));
  assert.equal(response.status, 502);

  response = await handleRequest(request(), env, async () => new Response('<xml/>'));
  assert.equal(response.status, 502);
});

test('returns 504 when upstream times out', async () => {
  const response = await handleRequest(request(), env, async () => {
    const error = new Error('aborted');
    error.name = 'AbortError';
    throw error;
  });
  assert.equal(response.status, 504);
  assert.equal((await response.json()).error, 'upstream_timeout');
});

test('parseJson and validatePayload internals cover success branches', async () => {
  const parsed = await testInternals.parseJson(new Request('https://x.test', { method: 'POST', body: '{"ok":true}' }));
  assert.deepEqual(parsed.data, { ok: true });
  assert.equal(testInternals.validatePayload({ address: { addressLines: [' x '], components: {} } }), null);
  assert.match(testInternals.requestId(), /.+/);
});
