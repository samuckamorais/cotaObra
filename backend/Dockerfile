# ===================================
# Build Stage
# ===================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar package files
COPY package*.json ./
COPY prisma ./prisma/

# Instalar dependencias (incluindo devDependencies para build)
RUN npm ci

# Gerar Prisma Client
RUN npx prisma generate

# Copiar codigo fonte
COPY . .

# Build TypeScript
# NODE_OPTIONS limita o heap do tsc a 1GB para não estourar a RAM em
# VPSs pequenas (1-2GB). Default do Node é ~1.5GB, que costuma derrubar
# o build (e às vezes o SSH junto) em hosts apertados.
RUN NODE_OPTIONS="--max-old-space-size=1024" npm run build

# ===================================
# Production Stage
# ===================================
FROM node:20-alpine AS runner

# openssl: necessário pelo Prisma
# ffmpeg: necessário pelo FF-BE-020 (transcrição de áudio do WhatsApp).
#         WhatsApp entrega áudio em OPUS; convertemos para MP3 antes
#         de enviar ao OpenAI Whisper para evitar codec mismatch.
RUN apk add --no-cache openssl ffmpeg

WORKDIR /app

# Copiar package files e instalar apenas dependencias de producao
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --omit=dev && npx prisma generate

# Copiar build do estagio anterior
COPY --from=builder /app/dist ./dist

# Dar ownership ao usuario node ANTES de trocar de usuario
RUN chown -R node:node /app

# Usar usuario nao-root
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health/live || exit 1

CMD ["node", "dist/server.js"]
