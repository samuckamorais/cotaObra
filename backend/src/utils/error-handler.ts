import { Request, Response, NextFunction } from 'express';
import { AppError } from '../types';
import { logger } from './logger';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';

export class ErrorHandler {
  /**
   * Handler global de erros para Express
   */
  static handle(err: Error, req: Request, res: Response, _next: NextFunction): void {
    logger.error('Error caught by global handler', {
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    });

    // Erro customizado da aplicação
    if (err instanceof AppError) {
      res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code,
          message: err.message,
        },
      });
      return;
    }

    // Erros do Prisma
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      const { statusCode, code, message } = ErrorHandler.handlePrismaError(err);
      res.status(statusCode).json({
        success: false,
        error: { code, message },
      });
      return;
    }

    // Erros de validação Zod
    if (err instanceof ZodError) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Dados inválidos',
          details: err.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        },
      });
      return;
    }

    // Erro genérico
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Erro interno do servidor',
      },
    });
  }

  /**
   * Converte erros do Prisma em respostas amigáveis
   */
  private static handlePrismaError(err: Prisma.PrismaClientKnownRequestError): {
    statusCode: number;
    code: string;
    message: string;
  } {
    switch (err.code) {
      case 'P2002': {
        // Unique constraint violation
        const target = (err.meta?.target as string[]) || [];
        return {
          statusCode: 409,
          code: 'DUPLICATE_ENTRY',
          message: `Já existe um registro com este ${target.join(', ')}`,
        };
      }
      case 'P2025':
        // Record not found
        return {
          statusCode: 404,
          code: 'NOT_FOUND',
          message: 'Registro não encontrado',
        };
      case 'P2003':
        // Foreign key constraint failed
        return {
          statusCode: 400,
          code: 'INVALID_REFERENCE',
          message: 'Referência inválida a outro registro',
        };
      case 'P2014':
        // Required relation violation
        return {
          statusCode: 400,
          code: 'REQUIRED_RELATION',
          message: 'Relação obrigatória não foi fornecida',
        };
      default:
        return {
          statusCode: 500,
          code: 'DATABASE_ERROR',
          message: 'Erro ao acessar o banco de dados',
        };
    }
  }

  /**
   * Wrapper para async handlers que automaticamente captura erros
   */
  static asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
    return (req: Request, res: Response, next: NextFunction): void => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }
}

/**
 * Middleware de erro 404
 */
export const notFoundHandler = (req: Request, _res: Response, next: NextFunction): void => {
  next(new AppError(`Rota não encontrada: ${req.method} ${req.path}`, 'NOT_FOUND', 404));
};

/**
 * Helper para criar erros customizados comuns
 */
export const createError = {
  notFound: (message = 'Recurso não encontrado') =>
    new AppError(message, 'NOT_FOUND', 404),

  badRequest: (message = 'Requisição inválida') =>
    new AppError(message, 'BAD_REQUEST', 400),

  unauthorized: (message = 'Não autorizado') =>
    new AppError(message, 'UNAUTHORIZED', 401),

  forbidden: (message = 'Acesso negado') =>
    new AppError(message, 'FORBIDDEN', 403),

  conflict: (message = 'Conflito de dados') =>
    new AppError(message, 'CONFLICT', 409),

  quotaExceeded: (message = 'Limite de cotações atingido') =>
    new AppError(message, 'QUOTA_EXCEEDED', 429),
};
