import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../src/config.js';
import { errorResponse, jsonResponse } from '../src/errors.js';

test('loadConfig requires login and password', () => {
  assert.throws(() => loadConfig({}), /ADDRESS_DOCTOR_LOGIN, ADDRESS_DOCTOR_PASSWORD/);
  assert.throws(() => loadConfig({ ADDRESS_DOCTOR_LOGIN: 'id' }), /ADDRESS_DOCTOR_PASSWORD/);
});

test('loadConfig applies defaults and validates numeric vars', () => {
  const config = loadConfig({
    ADDRESS_DOCTOR_LOGIN: 'id',
    ADDRESS_DOCTOR_PASSWORD: 'pw',
    ADDRESS_DOCTOR_TIMEOUT_MS: 'nope',
    ADDRESS_DOCTOR_MAX_RESULT_COUNT: '-1',
  });
  assert.equal(config.endpoint, 'https://validator5.addressdoctor.com/webservice5/v2/addressvalidation.asmx');
  assert.equal(config.jobToken, '');
  assert.equal(config.processMode, 'INTERACTIVE');
  assert.equal(config.defaultCountryISO3, 'USA');
  assert.equal(config.countryType, 'ISO2');
  assert.equal(config.timeoutMs, 5000);
  assert.equal(config.maxResultCount, 0);
});

test('loadConfig handles empty numeric strings as defaults', () => {
  const config = loadConfig({
    ADDRESS_DOCTOR_LOGIN: 'id',
    ADDRESS_DOCTOR_PASSWORD: 'pw',
    ADDRESS_DOCTOR_TIMEOUT_MS: '',
    ADDRESS_DOCTOR_MAX_RESULT_COUNT: '',
  });
  assert.equal(config.timeoutMs, 5000);
  assert.equal(config.maxResultCount, 0);
});

test('loadConfig uses supplied values', () => {
  const config = loadConfig({
    ADDRESS_DOCTOR_ENDPOINT: 'https://example.test/soap',
    ADDRESS_DOCTOR_LOGIN: 'id',
    ADDRESS_DOCTOR_PASSWORD: 'pw',
    ADDRESS_DOCTOR_JOB_TOKEN: 'job',
    ADDRESS_DOCTOR_PROCESS_MODE: 'FASTCOMPLETION',
    ADDRESS_DOCTOR_DEFAULT_COUNTRY_ISO3: 'CAN',
    ADDRESS_DOCTOR_COUNTRY_TYPE: 'ISO3',
    ADDRESS_DOCTOR_TIMEOUT_MS: '1',
    ADDRESS_DOCTOR_MAX_RESULT_COUNT: '5',
  });
  assert.equal(config.endpoint, 'https://example.test/soap');
  assert.equal(config.jobToken, 'job');
  assert.equal(config.processMode, 'FASTCOMPLETION');
  assert.equal(config.defaultCountryISO3, 'CAN');
  assert.equal(config.countryType, 'ISO3');
  assert.equal(config.timeoutMs, 1);
  assert.equal(config.maxResultCount, 5);
});

test('jsonResponse and errorResponse produce JSON', async () => {
  const ok = jsonResponse({ ok: true }, 202, { 'X-Test': '1' });
  assert.equal(ok.status, 202);
  assert.equal(ok.headers.get('Content-Type'), 'application/json');
  assert.equal(ok.headers.get('X-Test'), '1');
  assert.deepEqual(await ok.json(), { ok: true });

  const err = errorResponse(502, 'upstream_error', 'failed', 'req-1');
  assert.equal(err.status, 502);
  assert.deepEqual(await err.json(), { error: 'upstream_error', message: 'failed', requestId: 'req-1' });

  const minimal = errorResponse(403, 'forbidden');
  assert.deepEqual(await minimal.json(), { error: 'forbidden' });
});
