// Talks to @xflip/server. Auth is a JWT in an httpOnly cookie, so every
// request just needs credentials:'include' — no token handling on the client.

const BASE = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((body.error as string) ?? `Request failed (${res.status})`);
  return body as T;
}

export async function me(): Promise<string | null> {
  const { user } = await request<{ user: string | null }>('/me');
  return user;
}

export async function register(username: string, password: string): Promise<string> {
  const { username: u } = await request<{ username: string }>('/register', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  return u;
}

export async function login(username: string, password: string): Promise<string> {
  const { username: u } = await request<{ username: string }>('/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  return u;
}

export async function logout(): Promise<void> {
  await request('/logout', { method: 'POST' });
}

export async function fetchCollection(): Promise<Record<string, number>> {
  const { collection } = await request<{ collection: Record<string, number> }>('/collection');
  return collection;
}

export async function addCards(gids: string[]): Promise<Record<string, number>> {
  const { collection } = await request<{ collection: Record<string, number> }>('/collection', {
    method: 'POST',
    body: JSON.stringify({ gids }),
  });
  return collection;
}

export async function fetchOpens(): Promise<Record<string, number>> {
  const { opens } = await request<{ opens: Record<string, number> }>('/opens');
  return opens;
}

export async function recordOpen(pack: string): Promise<Record<string, number>> {
  const { opens } = await request<{ opens: Record<string, number> }>('/opens', {
    method: 'POST',
    body: JSON.stringify({ pack }),
  });
  return opens;
}
