/**
 * Setup global para testes Jest
 */

// Mock de variáveis de ambiente para testes
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/cotaobra_test';
process.env.REDIS_URL = 'redis://localhost:6379/1';
process.env.JWT_SECRET = 'test_jwt_secret_with_at_least_32_chars';
process.env.NODE_ENV = 'test';
process.env.WHATSAPP_PROVIDER = 'twilio';
process.env.LOG_LEVEL = 'error';

// Timeout padrão para testes
jest.setTimeout(10000);
