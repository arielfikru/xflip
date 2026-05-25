// Minimal local-only auth for the demo. Accounts live in localStorage; the
// password is never stored — only a SHA-256 hash of (salt + password). This is
// NOT real security (anyone with the device can read localStorage), it just
// scopes each player's collection to a named account.

const USERS_KEY = 'xflip-users';
const SESSION_KEY = 'xflip-session';

interface StoredUser {
  salt: string;
  hash: string;
}

type UserMap = Record<string, StoredUser>;

function readUsers(): UserMap {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    return raw ? (JSON.parse(raw) as UserMap) : {};
  } catch {
    return {};
  }
}

function writeUsers(users: UserMap): void {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function randomSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(salt: string, password: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function currentUser(): string | null {
  return localStorage.getItem(SESSION_KEY);
}

export function logout(): void {
  localStorage.removeItem(SESSION_KEY);
}

export async function register(username: string, password: string): Promise<string> {
  const name = username.trim();
  if (name.length < 3) throw new Error('Username must be at least 3 characters');
  if (password.length < 4) throw new Error('Password must be at least 4 characters');
  const users = readUsers();
  if (users[name]) throw new Error('Username already taken');
  const salt = randomSalt();
  const hash = await hashPassword(salt, password);
  users[name] = { salt, hash };
  writeUsers(users);
  localStorage.setItem(SESSION_KEY, name);
  return name;
}

export async function login(username: string, password: string): Promise<string> {
  const name = username.trim();
  const users = readUsers();
  const user = users[name];
  if (!user) throw new Error('No such account');
  const hash = await hashPassword(user.salt, password);
  if (hash !== user.hash) throw new Error('Wrong password');
  localStorage.setItem(SESSION_KEY, name);
  return name;
}
