export function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

export function errorResponse(status, error, message, requestId) {
  return jsonResponse({
    error,
    ...(message ? { message } : {}),
    ...(requestId ? { requestId } : {}),
  }, status);
}
