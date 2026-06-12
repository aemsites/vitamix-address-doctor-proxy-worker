const EXACT_ALLOWED_ORIGINS = new Set([
  'https://test.vitamix.com',
  'https://uat.vitamix.com',
  'https://integration.vitamix.com',
  'http://localhost:3000',
]);

const AEM_ALLOWED_ORIGIN_RE = /^https:\/\/[a-z0-9-]+--vitamix--aemsites\.aem\.(page|live|network)$/i;

export function isAllowedOrigin(origin) {
  if (!origin) return false;
  return EXACT_ALLOWED_ORIGINS.has(origin) || AEM_ALLOWED_ORIGIN_RE.test(origin);
}

export function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  };
}

export function withCors(response, origin) {
  const headers = new Headers(response.headers);
  Object.entries(corsHeaders(origin)).forEach(([key, value]) => headers.set(key, value));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
