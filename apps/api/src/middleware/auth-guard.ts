import Elysia from 'elysia';
import type { UserRole } from '@prisma/client';
import { verifySession, COOKIE_NAME, type SessionPayload } from '../lib/auth';

const unauthorizedBody = {
  success: false,
  error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
} as const;

const forbiddenBody = {
  success: false,
  error: { code: 'FORBIDDEN', message: 'Insufficient permissions' },
} as const;

// Plugin function: reads wind-acc-session cookie, verifies JWT, attaches ctx.user.
// Returns 401 if the cookie is absent or the token is invalid/expired.
export const authGuard = (app: Elysia) =>
  app
    .derive(async ({ cookie }) => {
      const token = cookie[COOKIE_NAME]?.value;
      const user = token ? await verifySession(token) : null;
      return { user } as { user: SessionPayload };
    })
    .onBeforeHandle(({ user, set }) => {
      if (!user) {
        set.status = 401;
        return unauthorizedBody;
      }
    });

// Returns a plugin that applies authGuard + a role check.
// Returns 403 when the authenticated user's role is not in the allowed list.
export const requireRole = (roles: UserRole[]) => (app: Elysia) =>
  app
    .use(authGuard)
    .onBeforeHandle(({ user, set }) => {
      if (!roles.includes(user.role)) {
        set.status = 403;
        return forbiddenBody;
      }
    });
