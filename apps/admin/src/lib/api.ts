const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string | null;
};

export class ApiError extends Error {
  status: number;
  code: string | undefined;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let accessTokenMemory: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function setAccessToken(token: string | null) {
  accessTokenMemory = token;
}

export function getAccessToken() {
  return accessTokenMemory;
}

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const res = await fetch(`${API_URL}/api/admin/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        setAccessToken(null);
        return null;
      }
      const data = (await res.json()) as { accessToken: string };
      setAccessToken(data.accessToken);
      return data.accessToken;
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const token = options.token === undefined ? accessTokenMemory : options.token;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const doFetch = () => {
    const init: RequestInit = {
      method: options.method ?? (options.body ? 'POST' : 'GET'),
      credentials: 'include',
      headers,
    };
    if (options.body !== undefined) {
      init.body = JSON.stringify(options.body);
    }
    return fetch(`${API_URL}${path}`, init);
  };
  let res = await doFetch();

  if (res.status === 401 && !path.includes('/auth/login') && !path.includes('/auth/refresh')) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers.Authorization = `Bearer ${refreshed}`;
      res = await doFetch();
    }
  }

  if (!res.ok) {
    let message = res.statusText;
    let code: string | undefined;
    try {
      const data = (await res.json()) as { error?: { message?: string; code?: string } };
      message = data.error?.message ?? message;
      code = data.error?.code;
    } catch {
      // ignore
    }
    throw new ApiError(res.status, message, code);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

/** Opens a PDF endpoint in a new tab using the current access token. */
export async function openAuthenticatedPdf(path: string) {
  const headers: Record<string, string> = { Accept: 'application/pdf' };
  if (accessTokenMemory) {
    headers.Authorization = `Bearer ${accessTokenMemory}`;
  }
  let res = await fetch(`${API_URL}${path}`, { credentials: 'include', headers });
  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers.Authorization = `Bearer ${refreshed}`;
      res = await fetch(`${API_URL}${path}`, { credentials: 'include', headers });
    }
  }
  if (!res.ok) {
    throw new ApiError(res.status, 'No se pudo generar el PDF');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
