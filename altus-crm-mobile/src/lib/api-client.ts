import { apiBaseUrl, supabase } from './supabase-client';

export type ApiResult<T> = { ok: true } & T | { ok: false; error: string };

async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: 'Not signed in.' };

  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Bearer ${token}`,
        ...init?.headers,
      },
    });
    const json = (await response.json()) as ApiResult<T>;
    return json;
  } catch {
    return { ok: false, error: 'Unable to reach the server. Check your connection.' };
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: Record<string, unknown>) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
};
