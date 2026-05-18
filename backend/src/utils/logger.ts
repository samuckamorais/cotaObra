import winston from 'winston';
import { env } from '../config/env';

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Formato customizado para logs
const customFormat = printf(({ level, message, timestamp, stack, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;

  // Adiciona stack trace se houver erro
  if (stack) {
    msg += `\n${stack}`;
  }

  // Adiciona metadata adicional
  if (Object.keys(metadata).length > 0) {
    msg += `\n${JSON.stringify(metadata, null, 2)}`;
  }

  return msg;
});

// Criar logger Winston
export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    env.NODE_ENV === 'development' ? colorize() : winston.format.uncolorize(),
    customFormat
  ),
  transports: [
    // Console transport
    new winston.transports.Console({
      stderrLevels: ['error'],
    }),
  ],
});

// Adicionar file transport em produção
if (env.NODE_ENV === 'production') {
  logger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
    })
  );
  logger.add(
    new winston.transports.File({
      filename: 'logs/combined.log',
    })
  );
}

// Helper para logar com contexto de quote
export const logWithContext = (
  level: 'info' | 'warn' | 'error' | 'debug',
  message: string,
  context: { quoteId?: string; producerId?: string; supplierId?: string; [key: string]: unknown }
) => {
  logger[level](message, context);
};

export default logger;
