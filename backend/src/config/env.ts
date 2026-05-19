import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url(),

  // Server
  PORT: z.string().default('3000').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Authentication
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('15m'), // access token curto (15 minutos)
  JWT_REFRESH_EXPIRES_IN: z.string().default('90d'), // refresh token longo (90 dias)
  JWT_REFRESH_SECRET: z.string().min(32).optional(), // se não definido, usa JWT_SECRET + sufixo

  // WhatsApp Provider — Sprint 0 D-01: Evolution API é o provider primário do MVP CotaObra.
  WHATSAPP_PROVIDER: z.enum(['twilio', 'evolution']).default('evolution'),

  // Twilio (optional if using Evolution API)
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_WHATSAPP_NUMBER: z.string().optional(),

  // Evolution API (optional if using Twilio)
  EVOLUTION_API_URL: z.preprocess(val => { if (typeof val !== 'string') return val; const t = val.trim(); return t === '' ? undefined : t; }, z.string().url().optional()),
  EVOLUTION_API_KEY: z.string().optional(),
  EVOLUTION_INSTANCE_NAME: z.string().optional(),
  EVOLUTION_WEBHOOK_SECRET: z.string().optional(),

  // AUD-04 (CO-0-10): mitigação anti-bloqueio do número Evolution.
  // Valores padrão conservadores para os primeiros 14 dias após warming.
  EVOLUTION_MAX_MSG_PER_HOUR: z.string().default('30').transform(Number),
  EVOLUTION_MIN_DELAY_MS: z.string().default('8000').transform(Number),
  EVOLUTION_MAX_DELAY_MS: z.string().default('25000').transform(Number),
  EVOLUTION_ABORT_AFTER_ERRORS: z.string().default('3').transform(Number),
  EVOLUTION_PAUSE_DURATION_MS: z.string().default('3600000').transform(Number), // 1h

  // Webhook
  WEBHOOK_URL: z.preprocess(val => { if (typeof val !== 'string') return val; const t = val.trim(); return t === '' ? undefined : t; }, z.string().url().optional()),

  // OpenAI
  OPENAI_API_KEY: z.string().optional(), // optional para permitir mock
  OPENAI_MODEL: z.string().default('gpt-4o'),

  // Frontend URL (para gerar links enviados via WhatsApp)
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),

  // Feature Flags
  // Rede de fornecedores própria da CotaObra (isNetworkSupplier=true).
  // Desabilitada no lançamento — requer onboarding ativo de fornecedores de rede.
  // Para reativar: ENABLE_NETWORK_SUPPLIERS=true + reiniciar servidor.
  ENABLE_NETWORK_SUPPLIERS: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  // FEAT-007 — Smart Quote (Cotação Inteligente). Kill-switch global.
  // Quando false, o handler IDLE ignora multi-slot e cai no fluxo
  // sequencial tradicional (preserva 100% da retrocompatibilidade).
  // Para ativar: SMART_FILL_ENABLED=true + reiniciar servidor.
  SMART_FILL_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  // Bypass temporário da validação de assinatura Twilio (X-Twilio-Signature).
  // ATENÇÃO: só para debug em prod quando a assinatura falha mas tudo o mais
  // está correto (auth token confirmado, URL correta, etc). Quando true,
  // qualquer cliente pode fazer POST no webhook e disparar o pipeline.
  // Default: false. Para ativar: WHATSAPP_SKIP_SIGNATURE_VALIDATION=true.
  WHATSAPP_SKIP_SIGNATURE_VALIDATION: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  // Business Logic
  QUOTE_EXPIRY_MINUTES: z.string().default('120').transform(Number),
  CONSOLIDATE_CHECK_INTERVAL: z.string().default('5').transform(Number),

  // Rate Limiting
  MAX_MESSAGES_PER_PHONE_PER_MINUTE: z.string().default('30').transform(Number),

  // SMTP (Email)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().default('587').transform(Number),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('noreply@cotaobra.com.br'),

  // CORS & Rate Limiting
  ALLOWED_ORIGINS: z.string().default('*'),
  RATE_LIMIT_GLOBAL: z.string().default('100').transform(Number),
  RATE_LIMIT_AUTH: z.string().default('10').transform(Number),
  RATE_LIMIT_PUBLIC: z.string().default('10').transform(Number),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  // Encryption (for WhatsApp credentials)
  ENCRYPTION_KEY: z.string().min(32).optional(),

  // FEAT-PDF-001 — Storage MinIO (S3-compatible)
  // Endpoint INTERNO usado pelo backend (rede docker, sem SSL).
  // Default minio:9000 — funciona com docker compose.
  MINIO_INTERNAL_ENDPOINT: z.string().default('minio:9000'),
  // Endpoint PÚBLICO HTTPS — assinado nas presigned URLs para o
  // Twilio conseguir baixar. Obrigatório em prod (Twilio precisa
  // de URL HTTPS pública; rede interna do cluster não funciona).
  MINIO_PUBLIC_URL: z
    .preprocess(
      (val) => {
        if (typeof val !== 'string') return val;
        const t = val.trim();
        return t === '' ? undefined : t;
      },
      z.string().url().optional(),
    ),
  MINIO_ROOT_USER: z.string().optional(),
  MINIO_ROOT_PASSWORD: z.string().optional(),
  MINIO_BUCKET: z.string().default('cotaobra-purchase-orders'),
  // TTL da URL assinada que vai pro Twilio.
  PDF_PRESIGN_TTL_DAYS: z.string().default('7').transform(Number),

  // FEAT-PDF-001 (§14.4) — Feature flag de rollback rápido.
  // Quando false, o fluxo de fechamento NÃO enfileira o job de PDF
  // (cotação fecha normal, sem documento). Usar em emergência se a
  // geração estiver falhando massivamente em prod.
  PDF_GENERATION_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),

  // CO-8-04 — Asaas billing (gateway BR PIX/Boleto/Cartão).
  // null/vazio = modo stub (sem cobrança real, mas IDs fakes persistidos).
  ASAAS_API_KEY: z.string().optional(),
  ASAAS_BASE_URL: z.string().default('https://api.asaas.com/v3'),
});

export type Env = z.infer<typeof envSchema>;

let env: Env;

try {
  env = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('❌ Invalid environment variables:');
    error.errors.forEach((err) => {
      console.error(`  - ${err.path.join('.')}: ${err.message}`);
    });
    process.exit(1);
  }
  throw error;
}

export { env };
