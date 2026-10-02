import { Prisma } from '@prisma/client';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import type { ApiErrorBody } from '@gcs/types';
import { logger } from '../config/logger';
import { AppError } from '../utils/errors';

export const notFoundHandler: RequestHandler = (req, res) => {
  const body: ApiErrorBody = {
    success: false,
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` },
  };
  res.status(404).json(body);
};

function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      path: issue.path.join('.') || '(root)',
      message: issue.message,
    }));
    const first = details[0];
    const message = first ? `${first.path}: ${first.message}` : 'Invalid request';
    return new AppError(400, 'VALIDATION_ERROR', message, details);
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002': {
        const target = (err.meta?.target as string[] | string | undefined) ?? 'field';
        return new AppError(409, 'CONFLICT', `A record with this ${String(target)} already exists`);
      }
      case 'P2025':
        return new AppError(404, 'NOT_FOUND', 'Resource not found');
      case 'P2003':
        return new AppError(409, 'CONFLICT', 'This record is referenced by other records');
      default:
        break;
    }
  }

  // Malformed JSON body from express.json()
  if (
    typeof err === 'object' &&
    err !== null &&
    'type' in err &&
    (err as { type?: string }).type === 'entity.parse.failed'
  ) {
    return new AppError(400, 'VALIDATION_ERROR', 'Request body is not valid JSON');
  }
  if (
    typeof err === 'object' &&
    err !== null &&
    'type' in err &&
    (err as { type?: string }).type === 'entity.too.large'
  ) {
    return new AppError(413 as number, 'VALIDATION_ERROR', 'Request body is too large');
  }

  return new AppError(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.');
}

/** Central error handler. Never leaks stack traces, SQL or secrets to clients. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const appError = toAppError(err);
  if (appError.status >= 500) {
    logger.error({ err, method: req.method, path: req.path }, 'Unhandled error');
  } else {
    logger.debug({ code: appError.code, path: req.path, msg: appError.message }, 'Request failed');
  }
  const body: ApiErrorBody = {
    success: false,
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details ? { details: appError.details } : {}),
    },
  };
  res.status(appError.status).json(body);
};
