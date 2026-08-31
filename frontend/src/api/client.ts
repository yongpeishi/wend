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
  // A FormData body is the deliberate opt-out from the JSON content type below.
  // multipart/form-data is only parseable with the `boundary` parameter naming
  // the delimiter between the parts, and only the browser knows the token it is
  // about to generate; setting the header ourselves — with the wrong type or
  // with the right type and no boundary — leaves the server unable to read the
  // body at all. So the one encoding we must not name is checked for here,
  // rather than every multipart caller having to remember to delete a header.
  const isMultipart = init.body instanceof FormData;
  const response = await fetch(`/api${path}${buildQuery(options.params)}`, {
    credentials: 'include',
    signal: options.signal,
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body && !isMultipart ? { 'Content-Type': 'application/json' } : {}),
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
  /**
   * The file-upload POST. Same `request` as everything else, so a 422 arrives
   * as the same ApiError with the same `fieldErrors` — an upload rejected for
   * being too large is reported by exactly the code that reports a blank
   * message. The only difference is the body, and the header it must not set.
   */
  postForm: <T,>(path: string, form: FormData, options?: RequestOptions) =>
    request<T>(path, { method: 'POST', body: form }, options),
  patch: <T,>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }, options),
  put: <T,>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) }, options),
  delete: <T,>(path: string, options?: RequestOptions) => request<T>(path, { method: 'DELETE' }, options),
};
