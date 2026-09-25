const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  status: number;
  code: string | undefined;
  details: unknown;

  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function apiFetch<T>(
  path: string,
  options: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.headers ?? {}),
  };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const init: RequestInit = {
    method: options.method ?? (options.body ? 'POST' : 'GET'),
    credentials: 'include',
    headers,
  };
  if (options.body !== undefined) init.body = JSON.stringify(options.body);

  const res = await fetch(`${API_URL}${path}`, init);
  if (!res.ok) {
    let message = res.statusText;
    let code: string | undefined;
    let details: unknown;
    try {
      const data = (await res.json()) as {
        error?: { message?: string; code?: string; details?: unknown };
      };
      message = data.error?.message ?? message;
      code = data.error?.code;
      details = data.error?.details;
    } catch {
      // ignore
    }
    throw new ApiError(res.status, message, code, details);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export { API_URL };
