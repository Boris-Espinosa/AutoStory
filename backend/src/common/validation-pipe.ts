import { RequestHandler } from 'express';
import { ZodError, ZodTypeAny } from 'zod';
import { HttpError } from './http-error';

export interface ValidationIssue {
  field: string;
  message: string;
}

export class ValidationError extends HttpError {
  constructor(public readonly issues: ValidationIssue[]) {
    super(400, 'Datos inválidos.');
    this.name = 'ValidationError';
  }
}

export function formatIssues(error: ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.join('.') : 'body',
    message: issue.message,
  }));
}

/**
 * Equivalente Express del ValidationPipe global: valida el body contra un esquema
 * zod y lo reemplaza por el resultado "parseado". Así se aplica la whitelist
 * (las propiedades desconocidas se descartan) y los mensajes salen en español.
 */
export function validateBody<T extends ZodTypeAny>(schema: T): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body ?? {});

    if (!result.success) {
      next(new ValidationError(formatIssues(result.error)));
      return;
    }

    req.body = result.data;
    next();
  };
}
