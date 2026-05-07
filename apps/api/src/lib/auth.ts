import { SignJWT, jwtVerify } from 'jose';
import type { UserRole } from '@prisma/client';

const COOKIE_NAME = 'wind-acc-session';
const EXPIRY = '7d';
const ALG = 'HS256';

export { COOKIE_NAME };

export interface SessionPayload {
  user_id: string;
  role: UserRole;
}

function getSecret(): Uint8Array {
  const raw = process.env.JWT_SECRET;
  if (!raw) throw new Error('JWT_SECRET env var is not set');
  return new TextEncoder().encode(raw);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ user_id: payload.user_id, role: payload.role })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: [ALG] });
    if (typeof payload.user_id !== 'string' || typeof payload.role !== 'string') {
      return null;
    }
    return { user_id: payload.user_id, role: payload.role as UserRole };
  } catch {
    return null;
  }
}
