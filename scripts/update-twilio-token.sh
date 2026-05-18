#!/bin/bash

# =============================================================
# CotaObra — Atualiza apenas TWILIO_AUTH_TOKEN
#
# Use depois de rotacionar o Auth Token no Twilio Console
# (Account → API keys & tokens). Não muda SID, número, nem provider.
#
# Uso:
#   # Modo interativo (recomendado — token não fica no history nem em ps aux):
#   bash scripts/update-twilio-token.sh
#
#   # Modo automatizado (CI/script — token vai pro history!):
#   bash scripts/update-twilio-token.sh --token=<novo-token>
#
#   # Sem recriar o container (apenas escreve .env):
#   bash scripts/update-twilio-token.sh --no-restart
# =============================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

ROOT_ENV="$REPO_DIR/.env"
BACKEND_ENV="$REPO_DIR/backend/.env"

NEW_TOKEN=""
NO_RESTART=false

for arg in "$@"; do
  case "$arg" in
    --token=*)    NEW_TOKEN="${arg#*=}" ;;
    --no-restart) NO_RESTART=true ;;
    -h|--help)
      sed -n '2,20p' "$0" | sed 's/^# *//'
      exit 0
      ;;
    *)
      echo -e "${RED}Argumento desconhecido: $arg${NC}"
      exit 1
      ;;
  esac
done

echo ""
echo "============================================="
echo -e " ${BOLD}CotaObra — Atualizar TWILIO_AUTH_TOKEN${NC}"
echo "============================================="
echo ""

# -----------------------------------------------------------
# .env raiz precisa existir
# -----------------------------------------------------------
if [ ! -f "$ROOT_ENV" ]; then
  echo -e "${RED}❌ .env não encontrado em $ROOT_ENV${NC}"
  exit 1
fi

if ! grep -q "^TWILIO_AUTH_TOKEN=" "$ROOT_ENV"; then
  echo -e "${RED}❌ TWILIO_AUTH_TOKEN não existe no .env.${NC}"
  echo -e "${YELLOW}   Configure primeiro com: bash scripts/switch-to-twilio.sh${NC}"
  exit 1
fi

# -----------------------------------------------------------
# Lê token (silencioso se interativo)
# -----------------------------------------------------------
if [ -z "$NEW_TOKEN" ]; then
  read -rs -p "$(echo -e ${BOLD}Cole o novo Auth Token${NC} \(não aparece na tela\): )" NEW_TOKEN
  echo ""
fi

# -----------------------------------------------------------
# Validações
# -----------------------------------------------------------
if [ -z "$NEW_TOKEN" ]; then
  echo -e "${RED}❌ Token vazio.${NC}"
  exit 1
fi

if echo "$NEW_TOKEN" | grep -qiE 'xxxx|placeholder|seu_'; then
  echo -e "${RED}❌ Token parece ser um placeholder.${NC}"
  exit 1
fi

if ! echo "$NEW_TOKEN" | grep -qE '^[a-f0-9]{32}$'; then
  echo -e "${RED}❌ Token não bate com o padrão de 32 caracteres hexadecimais minúsculos.${NC}"
  echo -e "${RED}   Tamanho recebido: $(echo -n "$NEW_TOKEN" | wc -c)${NC}"
  exit 1
fi

# -----------------------------------------------------------
# Backup
# -----------------------------------------------------------
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_ROOT="${ROOT_ENV}.bak.${TIMESTAMP}"
cp "$ROOT_ENV" "$BACKUP_ROOT"
echo -e "${GREEN}✅ Backup .env criado: $BACKUP_ROOT${NC}"

if [ -f "$BACKEND_ENV" ]; then
  BACKUP_BACKEND="${BACKEND_ENV}.bak.${TIMESTAMP}"
  cp "$BACKEND_ENV" "$BACKUP_BACKEND"
  echo -e "${GREEN}✅ Backup backend/.env criado: $BACKUP_BACKEND${NC}"
fi

# -----------------------------------------------------------
# Atualiza .env raiz e backend/.env
# -----------------------------------------------------------
sed -i.tmp "s|^TWILIO_AUTH_TOKEN=.*|TWILIO_AUTH_TOKEN=${NEW_TOKEN}|" "$ROOT_ENV"
rm -f "${ROOT_ENV}.tmp"
echo -e "${GREEN}✅ .env atualizado${NC}"

if [ -f "$BACKEND_ENV" ] && grep -q "^TWILIO_AUTH_TOKEN=" "$BACKEND_ENV"; then
  sed -i.tmp "s|^TWILIO_AUTH_TOKEN=.*|TWILIO_AUTH_TOKEN=${NEW_TOKEN}|" "$BACKEND_ENV"
  rm -f "${BACKEND_ENV}.tmp"
  echo -e "${GREEN}✅ backend/.env atualizado${NC}"
fi

# Limpa variável local
NEW_TOKEN=""

# -----------------------------------------------------------
# Recria container
# -----------------------------------------------------------
if [ "$NO_RESTART" = true ]; then
  echo -e "${YELLOW}[skip] --no-restart — recrie manualmente:${NC}"
  echo "  docker compose up -d --force-recreate backend"
elif command -v docker &> /dev/null && [ -f "$REPO_DIR/docker-compose.yml" ]; then
  echo ""
  echo -e "${YELLOW}Recriando container backend...${NC}"
  docker compose up -d --force-recreate backend
  echo -e "${GREEN}✅ Backend recriado${NC}"

  # Smoke test: confirma tamanho do token no container
  echo ""
  echo -e "${YELLOW}Validando token no container...${NC}"
  TOKEN_LEN="$(docker compose exec -T backend sh -c 'printf "%s" "$TWILIO_AUTH_TOKEN" | wc -c' | tr -d '[:space:]')"
  TOKEN_HEAD="$(docker compose exec -T backend sh -c 'printf "%s" "$TWILIO_AUTH_TOKEN" | head -c 4')"
  TOKEN_TAIL="$(docker compose exec -T backend sh -c 'printf "%s" "$TWILIO_AUTH_TOKEN" | tail -c 4')"

  if [ "$TOKEN_LEN" != "32" ]; then
    echo -e "${RED}❌ Token no container tem $TOKEN_LEN chars (esperado: 32).${NC}"
    exit 1
  fi

  echo -e "${GREEN}  Tamanho: $TOKEN_LEN chars ✓${NC}"
  echo -e "${GREEN}  Primeiros 4: $TOKEN_HEAD${NC}"
  echo -e "${GREEN}  Últimos 4:   $TOKEN_TAIL${NC}"
  echo ""
  echo -e "${BOLD}Compare os 4 primeiros/últimos com o Twilio Console${NC}"
  echo "  https://console.twilio.com/ → Account Info → Auth Token → View"
else
  echo -e "${YELLOW}⚠️  Docker não detectado — recrie o backend manualmente.${NC}"
fi

echo ""
echo "============================================="
echo -e " ${GREEN}Auth Token atualizado.${NC}"
echo "============================================="
echo ""
echo -e "${BOLD}Para reverter:${NC}"
echo "  cp $BACKUP_ROOT $ROOT_ENV"
if [ -f "$BACKEND_ENV" ]; then
  echo "  cp $BACKUP_BACKEND $BACKEND_ENV"
fi
echo "  docker compose up -d --force-recreate backend"
echo ""
