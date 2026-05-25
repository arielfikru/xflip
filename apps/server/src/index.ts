import 'dotenv/config';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { type Context, Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { COOKIE_NAME, hashPassword, signToken, verifyPassword, verifyToken } from './auth.js';
import {
  addCards,
  createUser,
  findUserById,
  findUserByName,
  getCollection,
  getOpens,
  recordOpen,
} from './db.js';

const PORT = Number(process.env.PORT ?? 8787);
const PROD = process.env.NODE_ENV === 'production';
const STATIC_ROOT = process.env.XFLIP_STATIC_ROOT ?? '../playground/dist';

const app = new Hono();

async function currentUserId(c: Context): Promise<number | null> {
  const token = getCookie(c, COOKIE_NAME);
  if (!token) return null;
  try {
    const { userId } = await verifyToken(token);
    return findUserById(userId) ? userId : null;
  } catch {
    return null;
  }
}

function issue(c: Context, token: string): void {
  setCookie(c, COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: PROD,
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

app.post('/api/register', async (c) => {
  const { username, password } = await c.req.json<{ username?: string; password?: string }>();
  const name = (username ?? '').trim();
  if (name.length < 3) return c.json({ error: 'Username must be at least 3 characters' }, 400);
  if ((password ?? '').length < 4)
    return c.json({ error: 'Password must be at least 4 characters' }, 400);
  if (findUserByName(name)) return c.json({ error: 'Username already taken' }, 409);
  const user = createUser(name, await hashPassword(password as string));
  issue(c, await signToken(user.id, user.username));
  return c.json({ username: user.username });
});

app.post('/api/login', async (c) => {
  const { username, password } = await c.req.json<{ username?: string; password?: string }>();
  const name = (username ?? '').trim();
  const user = findUserByName(name);
  if (!user || !(await verifyPassword(password ?? '', user.pw_hash)))
    return c.json({ error: 'Wrong username or password' }, 401);
  issue(c, await signToken(user.id, user.username));
  return c.json({ username: user.username });
});

app.post('/api/logout', (c) => {
  deleteCookie(c, COOKIE_NAME, { path: '/' });
  return c.json({ ok: true });
});

app.get('/api/me', async (c) => {
  const userId = await currentUserId(c);
  if (!userId) return c.json({ user: null });
  const user = findUserById(userId);
  return c.json({ user: user?.username ?? null });
});

app.get('/api/collection', async (c) => {
  const userId = await currentUserId(c);
  if (!userId) return c.json({ error: 'Not authenticated' }, 401);
  return c.json({ collection: getCollection(userId) });
});

app.post('/api/collection', async (c) => {
  const userId = await currentUserId(c);
  if (!userId) return c.json({ error: 'Not authenticated' }, 401);
  const { gids } = await c.req.json<{ gids?: string[] }>();
  if (!Array.isArray(gids) || gids.some((g) => typeof g !== 'string'))
    return c.json({ error: 'gids must be a string array' }, 400);
  return c.json({ collection: addCards(userId, gids) });
});

app.get('/api/opens', async (c) => {
  const userId = await currentUserId(c);
  if (!userId) return c.json({ error: 'Not authenticated' }, 401);
  return c.json({ opens: getOpens(userId) });
});

app.post('/api/opens', async (c) => {
  const userId = await currentUserId(c);
  if (!userId) return c.json({ error: 'Not authenticated' }, 401);
  const { pack } = await c.req.json<{ pack?: string }>();
  if (typeof pack !== 'string' || !pack)
    return c.json({ error: 'pack must be a non-empty string' }, 400);
  return c.json({ opens: recordOpen(userId, pack) });
});

if (PROD) {
  app.use('/*', serveStatic({ root: STATIC_ROOT }));
  app.get('/*', serveStatic({ path: 'index.html', root: STATIC_ROOT }));
}

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[xflip-server] listening on http://localhost:${info.port}`);
});
