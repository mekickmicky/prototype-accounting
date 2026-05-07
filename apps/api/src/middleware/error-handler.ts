import Elysia from 'elysia';
import { BusinessRuleError, getThaiMessage } from '../lib/errors';

export const errorHandler = (app: Elysia) =>
  app.onError(({ error, set }) => {
    if (error instanceof BusinessRuleError) {
      set.status = error.httpStatus;
      return {
        success: false as const,
        error: {
          code: error.code,
          message: getThaiMessage(error.code, error.context),
          ...(error.context !== undefined ? { context: error.context } : {}),
        },
      };
    }

    console.error('[unhandled]', error);
    set.status = 500;
    return {
      success: false as const,
      error: {
        code: 'INTERNAL_ERROR' as const,
        message: getThaiMessage('INTERNAL_ERROR'),
      },
    };
  });
