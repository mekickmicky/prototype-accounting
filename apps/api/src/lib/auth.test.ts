import { describe, test, expect, beforeAll } from 'bun:test';
import Elysia from 'elysia';
import { signSession, verifySession } from './auth';
import { authGuard, requireRole } from '../middleware/auth-guard';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-32-bytes-long-enough!!';
});

describe('signSession + verifySession', () => {
  test('round-trips a valid session', async () => {
    const token = await signSession({ user_id: 'u1', role: 'ADMIN' });
    const session = await verifySession(token);
    expect(session).toEqual({ user_id: 'u1', role: 'ADMIN' });
  });

  test('returns null for a tampered token', async () => {
    const token = await signSession({ user_id: 'u1', role: 'ADMIN' });
    const tampered = token.slice(0, -5) + 'XXXXX';
    expect(await verifySession(tampered)).toBeNull();
  });

  test('returns null for garbage input', async () => {
    expect(await verifySession('not.a.token')).toBeNull();
  });
});

function cookieHeader(token: string): string {
  return `wind-acc-session=${token}`;
}

describe('authGuard middleware', () => {
  const app = new Elysia()
    .use(authGuard)
    .get('/me', ({ user }) => ({ user_id: user.user_id, role: user.role }));

  test('populates ctx.user for a valid token', async () => {
    const token = await signSession({ user_id: 'u1', role: 'ACCOUNTANT' });
    const res = await app.handle(
      new Request('http://localhost/me', {
        headers: { cookie: cookieHeader(token) },
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user_id).toBe('u1');
    expect(body.role).toBe('ACCOUNTANT');
  });

  test('returns 401 when cookie is absent', async () => {
    const res = await app.handle(new Request('http://localhost/me'));
    expect(res.status).toBe(401);
  });

  test('returns 401 for an invalid token', async () => {
    const res = await app.handle(
      new Request('http://localhost/me', {
        headers: { cookie: cookieHeader('invalid.token.value') },
      })
    );
    expect(res.status).toBe(401);
  });
});

describe('requireRole middleware', () => {
  const app = new Elysia()
    .use(requireRole(['ADMIN']))
    .get('/admin-only', ({ user }) => ({ ok: true, role: user.role }));

  test('allows matching role', async () => {
    const token = await signSession({ user_id: 'u1', role: 'ADMIN' });
    const res = await app.handle(
      new Request('http://localhost/admin-only', {
        headers: { cookie: cookieHeader(token) },
      })
    );
    expect(res.status).toBe(200);
  });

  test('returns 403 for a non-matching role', async () => {
    const token = await signSession({ user_id: 'u2', role: 'VIEWER' });
    const res = await app.handle(
      new Request('http://localhost/admin-only', {
        headers: { cookie: cookieHeader(token) },
      })
    );
    expect(res.status).toBe(403);
  });

  test('returns 401 when unauthenticated', async () => {
    const res = await app.handle(new Request('http://localhost/admin-only'));
    expect(res.status).toBe(401);
  });
});
