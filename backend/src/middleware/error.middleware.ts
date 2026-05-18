import { Request, Response, NextFunction } from 'express';
import { ErrorHandler } from '../utils/error-handler';
import { sentryService } from '../services/sentry.service';

/**
 * Middleware global de tratamento de erros
 * Deve ser o último middleware registrado no Express
 */
export const errorMiddleware = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  sentryService.captureException(err, { path: req.path, method: req.method });
  ErrorHandler.handle(err, req, res, next);
};
