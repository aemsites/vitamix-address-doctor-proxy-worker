import { isAllowedOrigin, corsHeaders, withCors } from './cors.js';
import { loadConfig } from './config.js';
import { jsonResponse, errorResponse } from './errors.js';
import { callAddressDoctor } from './soap.js';
import { normalizeAddressDoctorResponse } from './normalize.js';

const MAX_BODY_BYTES = 8192;

function requestId() {
  return crypto.randomUUID();
}

async function parseJson(request) {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    return { error: errorResponse(400, 'invalid_request', 'request body too large') };
  }
  try {
    return { data: JSON.parse(text) };
  } catch {
    return { error: errorResponse(400, 'invalid_request', 'request body must be valid JSON') };
  }
}

function validatePayload(data) {
  const lines = data?.address?.addressLines;
  if (!Array.isArray(lines) || !lines.some((line) => typeof line === 'string' && line.trim())) {
    return errorResponse(400, 'invalid_request', 'address.addressLines must be a non-empty array');
  }
  const components = data.address.components;
  if (components !== undefined && (components === null || typeof components !== 'object' || Array.isArray(components))) {
    return errorResponse(400, 'invalid_request', 'address.components must be an object when provided');
  }
  return null;
}

async function handleValidate(request, env, fetchImpl) {
  const parsed = await parseJson(request);
  if (parsed.error) return parsed.error;
  const validationError = validatePayload(parsed.data);
  if (validationError) return validationError;

  const id = requestId();
  let config;
  try {
    config = loadConfig(env);
  } catch (error) {
    console.error('configuration error', { requestId: id, message: error.message });
    return errorResponse(500, 'misconfigured', 'worker is missing required configuration', id);
  }

  let upstream;
  try {
    upstream = await callAddressDoctor(parsed.data.address, config, fetchImpl);
  } catch (error) {
    console.error('addressdoctor fetch failed', { requestId: id, message: error.message });
    return errorResponse(502, 'upstream_error', 'address validation failed', id);
  }

  if (upstream.timeout) return errorResponse(504, 'upstream_timeout', 'address validation timed out', id);
  if (!upstream.ok) return errorResponse(502, 'upstream_error', 'address validation failed', id);

  try {
    return jsonResponse(normalizeAddressDoctorResponse(upstream.text));
  } catch (error) {
    console.error('addressdoctor parse failed', { requestId: id, message: error.message });
    return errorResponse(502, 'upstream_error', 'address validation failed', id);
  }
}

export async function handleRequest(request, env = {}, fetchImpl = fetch) {
  const origin = request.headers.get('Origin');
  if (!isAllowedOrigin(origin)) return errorResponse(403, 'forbidden');

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  const url = new URL(request.url);
  if (url.pathname !== '/places/validate') {
    return withCors(errorResponse(404, 'not_found'), origin);
  }

  if (request.method !== 'POST') {
    return withCors(errorResponse(405, 'method_not_allowed'), origin);
  }

  return withCors(await handleValidate(request, env, fetchImpl), origin);
}

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
};

export const testInternals = { parseJson, validatePayload, requestId };
