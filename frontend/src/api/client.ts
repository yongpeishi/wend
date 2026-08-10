import type { SimpleErrorBody, ValidationErrorBody } from './types';

/**
 * Thrown for any non-2xx response. `fieldErrors` is populated for the 422
 * `{ errors: {...} }` shape; `message` is always set (from `{ error }`,
 * flattened field errors, or the HTTP status text as a last resort).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly fieldErrors?: Record<string, string[]>;

  constructor(status: number, message: string, fieldErrors?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

function isValidationError(body: unknown): body is ValidationErrorBody {
  return typeof body === 'object' && body !== null && 'errors' in body;
}

function isSimpleError(body: unknown): body is SimpleErrorBody {
  return typeof body === 'object' && body !== null && 'error' in body;
}

function flattenFieldErrors(errors: Record<string, string[]>): string {
  return Object.entries(errors)
    .map(([field, messages]) => `${field} ${messages.join(', ')}`)
    .join('; ');
}

export interface RequestOptions {
  /** Query params appended and JSON-stringified where needed (booleans -> "true"/"false"). */
  params?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}

function buildQuery(params?: RequestOptions['params']): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

async function request<T>(path: string, init: RequestInit = {}, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`/api${path}${buildQuery(options.params)}`, {
    credentials: 'include',
    signal: options.signal,
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type') ?? '';
  const body: unknown = contentType.includes('application/json') ? await response.json() : undefined;

  if (!response.ok) {
    if (isValidationError(body)) {
      throw new ApiError(response.status, flattenFieldErrors(body.errors), body.errors);
    }
    if (isSimpleError(body)) {
      throw new ApiError(response.status, body.error);
    }
    throw new ApiError(response.status, response.statusText || `Request failed (${response.status})`);
  }

  return body as T;
}

export const api = {
  get: <T,>(path: string, options?: RequestOptions) => request<T>(path, { method: 'GET' }, options),
  post: <T,>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }, options),
  patch: <T,>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }, options),
  put: <T,>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) }, options),
  delete: <T,>(path: string, options?: RequestOptions) => request<T>(path, { method: 'DELETE' }, options),
};
