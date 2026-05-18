#!/bin/bash

# =============================================================
# CotaObra — Migra WhatsApp Provider para Twilio
#
# Atualiza .env (raiz + backend/) para usar Twilio, comenta as
# variáveis EVOLUTION_* (preservando-as para rollback), recria
# o container backend e valida que a env foi recarregada.
#
# Uso:
#   # Modo interativo (pergunta credenciais):
#   bash scripts/switch-to-twilio.sh
#
#   # Modo automatizado (CI/script):
#   bash scripts/switch-to-twilio.sh \
#       --sid=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
#       --token=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
#       --number=+14155238886
#
#   # Não comentar EVOLUTION_* (deixa configuradas para rollback rápido):
#   bash scripts/switch-to-twilio.sh --keep-evolution
#
#   # Pular recreate do container (apenas escrever .env):
#   bash scripts/switch-to-twilio.sh --no-restart
#
#   # Sobrescrever WEBHOOK_URL (default: https://api.cotaobra.com.br):
#   bash scripts/switch-to-twilio.sh --webhook-url=https://staging.cotaobra.com.br
#
# Após o script:
#   1. Configure o webhook no Twilio Console:
#      https://console.twilio.com/ → WhatsApp Sandbox / Senders
#      "When a message comes in" → POST → <URL impressa pelo script>
#   2. Envie uma mensagem de teste pelo WhatsApp
#
# Para reverter:
#   - cp <backup impresso> .env
#   - docker compose up -d --force-recreate backend
# =============================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

ROOT_ENV="$REPO_DIR/.env"
BACKEND_ENV="$REPO_DIR/backend/.env"

# -----------------------------------------------------------
# Defaults / args
# -----------------------------------------------------------
TWILIO_SID=""
TWILIO_TOKEN=""
TWILIO_NUMBER=""
WEBHOOK_URL_OVERRIDE=""
DEFAULT_WEBHOOK_URL="https://api.cotaobra.com.br"
KEEP_EVOLUTION=false
NO_RESTART=false

for arg in "$@"; do
  case "$arg" in
    --sid=*)          TWILIO_SID="${arg#*=}" ;;
    --token=*)        TWILIO_TOKEN="${arg#*=}" ;;
    --number=*)       TWILIO_NUMBER="${arg#*=}" ;;
    --webhook-url=*)  WEBHOOK_URL_OVERRIDE="${arg#*=}" ;;
    --keep-evolution) KEEP_EVOLUTION=true ;;
    --no-restart)     NO_RESTART=true ;;
    -h|--help)
      sed -n '2,35p' "$0" | sed 's/^# *//'
      exit 0
      ;;
    *)
      echo -e "${RED}Argumento desconhecido: $arg${NC}"
      echo "Use --help para ver as opções."
      exit 1
      ;;
  esac
done

FINAL_WEBHOOK_URL="${WEBHOOK_URL_OVERRIDE:-$DEFAULT_WEBHOOK_URL}"
# Remove trailing slash (vamos concatenar /api/whatsapp/webhook depois)
FINAL_WEBHOOK_URL="${FINAL_WEBHOOK_URL%/}"

echo ""
echo "============================================="
echo -e " ${BOLD}CotaObra — Migrar WhatsApp para Twilio${NC}"
echo " Diretório: $REPO_DIR"
echo "============================================="
echo ""

# -----------------------------------------------------------
# Verificar .env raiz
# -----------------------------------------------------------
if [ ! -f "$ROOT_ENV" ]; then
  echo -e "${RED}❌ Arquivo .env não encontrado em $ROOT_ENV${NC}"
  echo -e "${YELLOW}   Execute primeiro: bash scripts/vps-deploy.sh${NC}"
  exit 1
fi

# -----------------------------------------------------------
# Coletar credenciais (interativo se não veio por arg)
# -----------------------------------------------------------
if [ -z "$TWILIO_SID" ]; then
  read -p "$(echo -e ${BOLD}Twilio Account SID${NC} \(começa com AC...\): )" TWILIO_SID
fi

if [ -z "$TWILIO_TOKEN" ]; then
  read -sp "$(echo -e ${BOLD}Twilio Auth Token${NC}: )" TWILIO_TOKEN
  echo ""
fi

if [ -z "$TWILIO_NUMBER" ]; then
  read -p "$(echo -e ${BOLD}Twilio WhatsApp Number${NC} \(ex: +14155238886\): )" TWILIO_NUMBER
fi

# Validações mínimas (não validamos contra a Twilio API — fica como smoke test)
if [ -z "$TWILIO_SID" ] || [ -z "$TWILIO_TOKEN" ] || [ -z "$TWILIO_NUMBER" ]; then
  echo -e "${RED}❌ As três credenciais são obrigatórias.${NC}"
  exit 1
fi

# Rejeita placeholders óbvios — evita gravar AC...xxxxxxx ou similar no .env
if echo "$TWILIO_SID" | grep -qiE 'xxxx|placeholder|seu_'; then
  echo -e "${RED}❌ TWILIO_ACCOUNT_SID parece ser um placeholder ('$TWILIO_SID').${NC}"
  echo -e "${RED}   Pegue o SID real em https://console.twilio.com/ → Account Info.${NC}"
  exit 1
fi
if echo "$TWILIO_TOKEN" | grep -qiE 'xxxx|placeholder|seu_'; then
  echo -e "${RED}❌ TWILIO_AUTH_TOKEN parece ser um placeholder.${NC}"
  echo -e "${RED}   Pegue o Auth Token real em https://console.twilio.com/ → Account Info → View.${NC}"
  exit 1
fi

if ! echo "$TWILIO_SID" | grep -qE '^AC[a-f0-9]{32}$'; then
  echo -e "${RED}❌ Account SID não bate com o padrão AC + 32 hex: '$TWILIO_SID'${NC}"
  echo -e "${RED}   Esperado: AC<32 caracteres hexadecimais minúsculos>${NC}"
  exit 1
fi

if ! echo "$TWILIO_TOKEN" | grep -qE '^[a-f0-9]{32}$'; then
  echo -e "${RED}❌ Auth Token não bate com o padrão de 32 hex.${NC}"
  echo -e "${RED}   Esperado: 32 caracteres hexadecimais minúsculos.${NC}"
  exit 1
fi

if ! echo "$TWILIO_NUMBER" | grep -qE '^\+[0-9]{10,15}$'; then
  echo -e "${YELLOW}⚠️  Número não está em formato E.164 (+DDDXXXXXXXX). Continuando mesmo assim...${NC}"
fi

# -----------------------------------------------------------
# Backup do .env raiz antes de mexer
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
# Função idempotente: atualiza ou adiciona KEY=VALUE
# -----------------------------------------------------------
upsert_env() {
  local file="$1"
  local key="$2"
  local value="$3"

  if grep -q "^${key}=" "$file"; then
    sed -i.tmp "s|^${key}=.*|${key}=${value}|" "$file"
    rm -f "${file}.tmp"
  elif grep -q "^#${key}=" "$file"; then
    # Estava comentada — descomenta e atualiza
    sed -i.tmp "s|^#${key}=.*|${key}=${value}|" "$file"
    rm -f "${file}.tmp"
  else
    echo "${key}=${value}" >> "$file"
  fi
}

# Comenta uma chave (preserva o valor para rollback)
comment_env() {
  local file="$1"
  local key="$2"

  if grep -q "^${key}=" "$file"; then
    sed -i.tmp "s|^${key}=|#${key}=|" "$file"
    rm -f "${file}.tmp"
  fi
}

apply_to_env_file() {
  local file="$1"
  echo -e "${YELLOW}Atualizando ${file}...${NC}"

  upsert_env "$file" "WHATSAPP_PROVIDER" "twilio"
  upsert_env "$file" "TWILIO_ACCOUNT_SID" "$TWILIO_SID"
  upsert_env "$file" "TWILIO_AUTH_TOKEN" "$TWILIO_TOKEN"
  upsert_env "$file" "TWILIO_WHATSAPP_NUMBER" "$TWILIO_NUMBER"
  upsert_env "$file" "WEBHOOK_URL" "$FINAL_WEBHOOK_URL"

  if [ "$KEEP_EVOLUTION" = false ]; then
    comment_env "$file" "EVOLUTION_API_URL"
    comment_env "$file" "EVOLUTION_API_KEY"
    comment_env "$file" "EVOLUTION_INSTANCE_NAME"
    echo -e "${BLUE}  ↳ EVOLUTION_* comentadas (preservadas para rollback).${NC}"
  else
    echo -e "${BLUE}  ↳ EVOLUTION_* mantidas (flag --keep-evolution).${NC}"
  fi
}

apply_to_env_file "$ROOT_ENV"
if [ -f "$BACKEND_ENV" ]; then
  apply_to_env_file "$BACKEND_ENV"
fi

echo -e "${GREEN}✅ .env atualizado para Twilio${NC}"
echo ""

# -----------------------------------------------------------
# Recriar container backend
# -----------------------------------------------------------
if [ "$NO_RESTART" = true ]; then
  echo -e "${BLUE}[skip] --no-restart informado. Container NÃO foi recriado.${NC}"
  echo -e "${YELLOW}     Recrie manualmente para aplicar:${NC}"
  echo "       docker compose up -d --force-recreate backend"
elif command -v docker &> /dev/null && [ -f "$REPO_DIR/docker-compose.yml" ]; then
  echo -e "${YELLOW}Recriando container backend para recarregar env...${NC}"
  docker compose up -d --force-recreate backend
  echo -e "${GREEN}✅ Backend recriado${NC}"

  # Aguarda backend ficar saudável
  echo -e "${YELLOW}Aguardando healthcheck...${NC}"
  RETRIES=20
  until docker compose exec -T backend wget --no-verbose --tries=1 --spider http://localhost:3000/health/live &>/dev/null \
        || [ $RETRIES -eq 0 ]; do
    printf "."
    RETRIES=$((RETRIES-1))
    sleep 2
  done
  echo ""

  if [ $RETRIES -eq 0 ]; then
    echo -e "${RED}❌ Backend não respondeu ao healthcheck. Verifique:${NC}"
    echo "    docker compose logs --tail=50 backend"
    exit 1
  fi
  echo -e "${GREEN}✅ Backend saudável${NC}"

  # Smoke test: confirma que o container está enxergando a env nova
  echo ""
  echo -e "${YELLOW}Validando variáveis no container...${NC}"
  IN_CONTAINER_PROVIDER="$(docker compose exec -T backend printenv WHATSAPP_PROVIDER || true)"
  IN_CONTAINER_SID="$(docker compose exec -T backend printenv TWILIO_ACCOUNT_SID || true)"
  IN_CONTAINER_NUMBER="$(docker compose exec -T backend printenv TWILIO_WHATSAPP_NUMBER || true)"

  if [ "$(echo "$IN_CONTAINER_PROVIDER" | tr -d '\r\n')" != "twilio" ]; then
    echo -e "${RED}❌ WHATSAPP_PROVIDER no container = '$IN_CONTAINER_PROVIDER' (esperado: twilio)${NC}"
    echo -e "${YELLOW}   Confirme que o docker-compose.yml está lendo o .env correto.${NC}"
    exit 1
  fi

  echo -e "${GREEN}  WHATSAPP_PROVIDER     = $IN_CONTAINER_PROVIDER${NC}"
  echo -e "${GREEN}  TWILIO_ACCOUNT_SID    = ${IN_CONTAINER_SID:0:8}... (mascarado)${NC}"
  echo -e "${GREEN}  TWILIO_WHATSAPP_NUMBER= $IN_CONTAINER_NUMBER${NC}"
else
  echo -e "${YELLOW}⚠️  Docker não detectado — reinicie o backend manualmente.${NC}"
fi

# -----------------------------------------------------------
# Webhook URL para o Twilio Console
# -----------------------------------------------------------
WEBHOOK_FULL="${FINAL_WEBHOOK_URL}/api/whatsapp/webhook"

echo ""
echo "============================================="
echo -e " ${GREEN}${BOLD}Migração para Twilio concluída.${NC}"
echo "============================================="
echo ""

if [ -n "$WEBHOOK_URL_OVERRIDE" ]; then
  echo -e "${BLUE}WEBHOOK_URL definido via --webhook-url: $FINAL_WEBHOOK_URL${NC}"
else
  echo -e "${BLUE}WEBHOOK_URL definido para o default de prod: $FINAL_WEBHOOK_URL${NC}"
  echo -e "${BLUE}  (use --webhook-url=<url> para staging/dev)${NC}"
fi
echo ""

echo -e "${BOLD}Próximos passos no Twilio Console:${NC}"
echo "  1. Acesse: https://console.twilio.com/"
echo "  2. Vá em: Messaging → Try it out → Send a WhatsApp message"
echo "     (ou Senders → WhatsApp se já tiver Sender aprovado)"
echo "  3. Em 'WHEN A MESSAGE COMES IN' configure:"
echo -e "        URL:    ${BOLD}${GREEN}$WEBHOOK_FULL${NC}"
echo "        Method: POST"
echo ""
echo -e "${BOLD}Teste rápido:${NC}"
echo "  - Envie uma mensagem de texto pelo WhatsApp para $TWILIO_NUMBER"
echo "  - Acompanhe os logs: docker compose logs -f backend"
echo ""

echo -e "${BOLD}Rollback (voltar para Evolution):${NC}"
echo "  cp $BACKUP_ROOT $ROOT_ENV"
if [ -f "$BACKEND_ENV" ]; then
  echo "  cp $BACKUP_BACKEND $BACKEND_ENV"
fi
echo "  docker compose up -d --force-recreate backend"
echo ""
