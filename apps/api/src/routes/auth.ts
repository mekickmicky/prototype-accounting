import { Elysia, t } from 'elysia';
import { prisma } from '../lib/prisma';
import { signSession, COOKIE_NAME } from '../lib/auth';
import { authGuard } from '../middleware/auth-guard';

const IS_PROD = process.env.NODE_ENV === 'production';
const CROSS_ORIGIN = !!process.env.CORS_ORIGIN;
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days in seconds

const internalError = {
  success: false,
  error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
} as const;

export const authRoutes = new Elysia({ prefix: '/auth' })
  .get('/users', async ({ set }) => {
    try {
      const users = await prisma.user.findMany({
        where: { is_active: true },
        select: { id: true, email: true, name: true, role: true },
        orderBy: [{ role: 'asc' }, { name: 'asc' }],
      });
      return { success: true, data: { users } };
    } catch {
      set.status = 500;
      return internalError;
    }
  })
  .post(
    '/login',
    async ({ body, cookie, set }) => {
      let user;
      try {
        user = await prisma.user.findUnique({ where: { id: body.user_id } });
      } catch {
        set.status = 500;
        return internalError;
      }

      if (!user || !user.is_active) {
        set.status = 404;
        return {
          success: false,
          error: { code: 'USER_NOT_FOUND', message: 'User not found or inactive' },
        };
      }

      const token = await signSession({ user_id: user.id, role: user.role });

      cookie[COOKIE_NAME].value = token;
      cookie[COOKIE_NAME].httpOnly = true;
      cookie[COOKIE_NAME].secure = IS_PROD || CROSS_ORIGIN;
      cookie[COOKIE_NAME].sameSite = CROSS_ORIGIN ? 'None' : 'Lax';
      cookie[COOKIE_NAME].path = '/';
      cookie[COOKIE_NAME].maxAge = SESSION_MAX_AGE;

      return {
        success: true,
        data: {
          user: { id: user.id, email: user.email, name: user.name, role: user.role },
        },
      };
    },
    { body: t.Object({ user_id: t.String() }) },
  )
  .post('/logout', ({ cookie, set }) => {
    cookie[COOKIE_NAME].remove();
    set.status = 204;
  })
  .use(authGuard)
  .get('/me', async ({ user, set }) => {
    if (!user) {
      set.status = 401;
      return {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      };
    }

    let dbUser;
    try {
      dbUser = await prisma.user.findUnique({ where: { id: user.user_id } });
    } catch {
      set.status = 500;
      return internalError;
    }

    if (!dbUser || !dbUser.is_active) {
      set.status = 401;
      return {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Session invalid' },
      };
    }

    return {
      success: true,
      data: {
        user: { id: dbUser.id, email: dbUser.email, name: dbUser.name, role: dbUser.role },
      },
    };
  });
