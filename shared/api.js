// Calls to the AP Portal API. Only used when AP_CONFIG.api is true.

class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

function apiMode() {
  return Boolean(window.AP_CONFIG && window.AP_CONFIG.api);
}

// Sends JSON and returns the parsed response. Failures throw an ApiError whose
// message is the server's explanation (ProblemDetails "detail" or "title").
async function apiFetch(path, { method = 'GET', body } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(`${window.AP_CONFIG.apiBase}${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again.', 0, null);
  }

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message = (data && (data.detail || data.title)) || `The request failed (${response.status}).`;
    throw new ApiError(message, response.status, data);
  }
  return data;
}
