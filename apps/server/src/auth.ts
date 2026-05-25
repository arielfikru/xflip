import bcrypt from 'bcryptjs';
import { jwtVerify, SignJWT } from 'jose';

const SECRET = new TextEncoder().encode(
  process.env.XFLIP_JWT_SECRET ?? 'dev-insecure-secret-change-me',
);
const ISSUER = 'xflip';
const TOKEN_TTL = '30d';

export const COOKIE_NAME = 'xflip_token';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function signToken(userId: number, username: string): Promise<string> {
  return new SignJWT({ username })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(userId))
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(SECRET);
}

export async function verifyToken(token: string): Promise<{ userId: number; username: string }> {
  const { payload } = await jwtVerify(token, SECRET, { issuer: ISSUER });
  return { userId: Number(payload.sub), username: String(payload.username) };
}
