import assert from 'node:assert/strict';
import test from 'node:test';
import { corsHeaders, isAllowedOrigin, withCors } from '../src/cors.js';

const allowed = [
  'https://test.vitamix.com',
  'https://uat.vitamix.com',
  'https://integration.vitamix.com',
  'http://localhost:3000',
  'https://main--vitamix--aemsites.aem.page',
  'https://branch-123--vitamix--aemsites.aem.live',
  'https://foo--vitamix--aemsites.aem.network',
];

test('allows configured exact and AEM origins', () => {
  allowed.forEach((origin) => assert.equal(isAllowedOrigin(origin), true));
});

test('rejects missing, wrong host, wrong scheme, and malformed origins', () => {
  [null, '', 'https://www.vitamix.com', 'http://test.vitamix.com', 'https://x--other--aemsites.aem.page', 'https://x--vitamix--aemsites.aem.bad'].forEach((origin) => {
    assert.equal(isAllowedOrigin(origin), false);
  });
});

test('builds cors headers for reflected allowed origin', () => {
  const headers = corsHeaders('https://uat.vitamix.com');
  assert.equal(headers['Access-Control-Allow-Origin'], 'https://uat.vitamix.com');
  assert.equal(headers.Vary, 'Origin');
  assert.equal(headers['Access-Control-Allow-Methods'], 'POST, OPTIONS');
  assert.equal(headers['Access-Control-Allow-Headers'], 'Content-Type');
  assert.equal(headers['Cache-Control'], 'no-store');
});

test('adds cors headers to an existing response', async () => {
  const response = withCors(new Response('ok', { status: 201, statusText: 'Created', headers: { 'X-Test': '1' } }), 'https://test.vitamix.com');
  assert.equal(response.status, 201);
  assert.equal(response.statusText, 'Created');
  assert.equal(response.headers.get('X-Test'), '1');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://test.vitamix.com');
  assert.equal(await response.text(), 'ok');
});
