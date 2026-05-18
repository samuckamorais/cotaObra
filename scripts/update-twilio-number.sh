#!/bin/bash

# =============================================================
# CotaObra — Atualiza apenas TWILIO_WHATSAPP_NUMBER
#
# Use quando trocar o Sender WhatsApp do Twilio (ex: do número
# de teste pro número definitivo). Não muda SID, auth token,
# nem provider.
#
# Uso:
#   # Padrão (define +556496082834):
#   bash scripts/update-twilio-number.sh
#
#   # Outro número:
#   bash scripts/update-twilio-number.sh --number=+14155238886
#
#   # Sem recriar o container (apenas escreve .env):
#   bash scripts/update-twilio-number.sh --no-restart
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

# Default = número solicitado nessa sessão
NEW_NUMBER="+556496082834"
NO_RESTART=false

for arg in "$@"; do
  case "$arg" in
    --number=*)   NEW_NUMBER="${arg#*=}" ;;
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
echo -e " ${BOLD}CotaObra — Atualizar TWILIO_WHATSAPP_NUMBER${NC}"
echo "============================================="
echo ""

# -----------------------------------------------------------
# .env raiz precisa existir
# -----------------------------------------------------------
if [ ! -f "$ROOT_ENV" ]; then
  echo -e "${RED}❌ .env não encontrado em $ROOT_ENV${NC}"
  exit 1
fi

if ! grep -q "^TWILIO_WHATSAPP_NUMBER=" "$ROOT_ENV"; then
  echo -e "${RED}❌ TWILIO_WHATSAPP_NUMBER não existe no .env.${NC}"
  echo -e "${YELLOW}   Configure primeiro com: bash scripts/switch-to-twilio.sh${NC}"
  exit 1
fi

# -----------------------------------------------------------
# Validação E.164
# -----------------------------------------------------------
if ! echo "$NEW_NUMBER" | grep -qE '^\+[0-9]{10,15}$'; then
  echo -e "${RED}❌ Número inválido: '$NEW_NUMBER'${NC}"
  echo -e "${RED}   Esperado: formato E.164, ex: +556496082834${NC}"
  exit 1
fi

CURRENT_NUMBER="$(grep "^TWILIO_WHATSAPP_NUMBER=" "$ROOT_ENV" | head -1 | cut -d'=' -f2)"
echo -e "${YELLOW}Atual:${NC} $CURRENT_NUMBER"
echo -e "${YELLOW}Novo: ${NC} $NEW_NUMBER"
echo ""

if [ "$CURRENT_NUMBER" = "$NEW_NUMBER" ]; then
  echo -e "${YELLOW}⚠️  Número já está configurado — nada a fazer.${NC}"
  exit 0
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
sed -i.tmp "s|^TWILIO_WHATSAPP_NUMBER=.*|TWILIO_WHATSAPP_NUMBER=${NEW_NUMBER}|" "$ROOT_ENV"
rm -f "${ROOT_ENV}.tmp"
echo -e "${GREEN}✅ .env atualizado${NC}"

if [ -f "$BACKEND_ENV" ] && grep -q "^TWILIO_WHATSAPP_NUMBER=" "$BACKEND_ENV"; then
  sed -i.tmp "s|^TWILIO_WHATSAPP_NUMBER=.*|TWILIO_WHATSAPP_NUMBER=${NEW_NUMBER}|" "$BACKEND_ENV"
  rm -f "${BACKEND_ENV}.tmp"
  echo -e "${GREEN}✅ backend/.env atualizado${NC}"
fi

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

  # Smoke test
  echo ""
  echo -e "${YELLOW}Validando número no container...${NC}"
  IN_CONTAINER="$(docker compose exec -T backend printenv TWILIO_WHATSAPP_NUMBER | tr -d '\r\n')"
  if [ "$IN_CONTAINER" != "$NEW_NUMBER" ]; then
    echo -e "${RED}❌ Container mostra '$IN_CONTAINER' (esperado: $NEW_NUMBER)${NC}"
    exit 1
  fi
  echo -e "${GREEN}✅ TWILIO_WHATSAPP_NUMBER = $IN_CONTAINER${NC}"
else
  echo -e "${YELLOW}⚠️  Docker não detectado — recrie o backend manualmente.${NC}"
fi

# -----------------------------------------------------------
# Próximos passos
# -----------------------------------------------------------
echo ""
echo "============================================="
echo -e " ${GREEN}Número atualizado.${NC}"
echo "============================================="
echo ""
echo -e "${BOLD}Lembre de atualizar no Twilio Console:${NC}"
echo "  1. Acesse: https://console.twilio.com/"
echo "  2. Messaging → Senders → WhatsApp → ${NEW_NUMBER}"
echo "  3. Configure 'When a message comes in':"
echo "     URL:    https://api.cotaobra.com.br/api/whatsapp/webhook"
echo "     Method: POST"
echo ""
echo -e "${BOLD}Para reverter:${NC}"
echo "  cp $BACKUP_ROOT $ROOT_ENV"
if [ -f "$BACKEND_ENV" ]; then
  echo "  cp $BACKUP_BACKEND $BACKEND_ENV"
fi
echo "  docker compose up -d --force-recreate backend"
echo ""
