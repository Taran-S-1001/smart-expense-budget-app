const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export class ApiError extends Error {
  constructor(message, { code = 'REQUEST_FAILED', status = 0 } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export async function request(path, { body, headers, ...options } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const responseText = await response.text();
  let responseBody;

  if (responseText) {
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      throw new ApiError('The server returned an invalid JSON response.', {
        code: 'INVALID_RESPONSE',
        status: response.status,
      });
    }
  }

  if (!response.ok) {
    throw new ApiError(
      responseBody?.error?.message || `Request failed with status ${response.status}.`,
      {
        code: responseBody?.error?.code || 'REQUEST_FAILED',
        status: response.status,
      },
    );
  }

  return responseBody;
}

export const api = {
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options) => request(path, { ...options, body, method: 'POST' }),
  put: (path, body, options) => request(path, { ...options, body, method: 'PUT' }),
  delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
};
