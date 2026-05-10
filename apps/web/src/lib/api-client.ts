const API_BASE = '';

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...init?.headers,
    },
  });

  let body: { success: boolean; data?: T; error?: { code: string; message: string } };
  try {
    body = await res.json();
  } catch {
    throw new ApiError('PARSE_ERROR', 'Failed to parse server response', res.status);
  }

  if (!body.success) {
    throw new ApiError(
      body.error?.code ?? 'UNKNOWN',
      body.error?.message ?? 'Unknown error',
      res.status,
    );
  }

  return body.data as T;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  getPaged: async <T, M = { total: number; page: number; page_size: number }>(
    path: string,
  ): Promise<{ data: T; meta: M }> => {
    const res = await fetch(`${API_BASE}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    });
    let body: {
      success: boolean;
      data?: T;
      meta?: M;
      error?: { code: string; message: string };
    };
    try {
      body = await res.json();
    } catch {
      throw new ApiError('PARSE_ERROR', 'Failed to parse server response', res.status);
    }
    if (!body.success) {
      throw new ApiError(
        body.error?.code ?? 'UNKNOWN',
        body.error?.message ?? 'Unknown error',
        res.status,
      );
    }
    return { data: body.data as T, meta: body.meta as M };
  },
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: data !== undefined ? JSON.stringify(data) : undefined,
    }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, {
      method: 'PATCH',
      body: data !== undefined ? JSON.stringify(data) : undefined,
    }),
  getBlob: async (path: string): Promise<Blob> => {
    const res = await fetch(`${API_BASE}${path}`, { credentials: 'include' });
    if (!res.ok) {
      let message = `Request failed: ${res.status}`;
      try {
        const body = await res.json();
        message = (body as { error?: { message?: string } })?.error?.message ?? message;
      } catch {}
      throw new ApiError('EXPORT_FAILED', message, res.status);
    }
    return res.blob();
  },
};
