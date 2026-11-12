import { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { HttpError } from './http-error';
import { error as logError } from './logger';
import { ValidationError, formatIssues } from './validation-pipe';

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ message: 'Recurso no encontrado.' });
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  // body-parser lanza SyntaxError con `body` cuando el JSON de entrada no es válido.
  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({ message: 'Datos inválidos.' });
    return;
  }

  if (error instanceof ValidationError) {
    res.status(error.statusCode).json({ message: error.message, errors: error.issues });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({ message: 'Datos inválidos.', errors: formatIssues(error) });
    return;
  }

  if (error instanceof HttpError) {
    res.status(error.statusCode).json({ message: error.message });
    return;
  }

  logError(
    'Error no controlado.',
    error instanceof Error ? error.name : undefined,
  );
  res.status(500).json({ message: 'Ocurrió un error inesperado en el servidor.' });
};
