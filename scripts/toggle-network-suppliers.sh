#!/bin/bash

# =============================================================
# CotaObra — Toggle ENABLE_NETWORK_SUPPLIERS
# Atualiza a flag no .env (raiz e backend/) e reinicia o backend.
#
# Uso:
#   bash scripts/toggle-network-suppliers.sh on
#   bash scripts/toggle-network-suppliers.sh off
#   bash scripts/toggle-network-suppliers.sh true
#   bash scripts/toggle-network-suppliers.sh false
#   bash scripts/toggle-network-suppliers.sh status     # apenas exibe valor atual
# =============================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

ROOT_ENV="$REPO_DIR/.env"
BACKEND_ENV="$REPO_DIR/backend/.env"

print_current() {
  if [ -f "$ROOT_ENV" ] && grep -q "^ENABLE_NETWORK_SUPPLIERS=" "$ROOT_ENV"; then
    local current
    current=$(grep "^ENABLE_NETWORK_SUPPLIERS=" "$ROOT_ENV" | head -1 | cut -d'=' -f2)
    echo -e "${YELLOW}Valor atual em .env:${NC} ENABLE_NETWORK_SUPPLIERS=${current}"
  else
    echo -e "${YELLOW}ENABLE_NETWORK_SUPPLIERS não está definido em .env (default: false)${NC}"
  fi
}

# -----------------------------------------------------------
# Validação de argumento
# -----------------------------------------------------------
if [ $# -lt 1 ]; then
  echo -e "${RED}❌ Uso: bash $0 <on|off|true|false|status>${NC}"
  print_current
  exit 1
fi

ARG="$(echo "$1" | tr '[:upper:]' '[:lower:]')"

case "$ARG" in
  on|true|1|enable|enabled)
    NEW_VALUE="true"
    ;;
  off|false|0|disable|disabled)
    NEW_VALUE="false"
    ;;
  status)
    print_current
    exit 0
    ;;
  *)
    echo -e "${RED}❌ Argumento inválido: '$1'${NC}"
    echo -e "${YELLOW}   Use: on | off | true | false | status${NC}"
    exit 1
    ;;
esac

# -----------------------------------------------------------
# Verificar se .env existe
# -----------------------------------------------------------
if [ ! -f "$ROOT_ENV" ]; then
  echo -e "${RED}❌ Arquivo .env não encontrado em $ROOT_ENV${NC}"
  echo -e "${YELLOW}   Execute primeiro: bash scripts/vps-deploy.sh${NC}"
  exit 1
fi

# -----------------------------------------------------------
# Backup do .env antes de qualquer alteração
# -----------------------------------------------------------
BACKUP="${ROOT_ENV}.bak.$(date +%Y%m%d-%H%M%S)"
cp "$ROOT_ENV" "$BACKUP"
echo -e "${GREEN}✅ Backup criado: $BACKUP${NC}"

# -----------------------------------------------------------
# Atualizar flag em .env (raiz)
# -----------------------------------------------------------
print_current

if grep -q "^ENABLE_NETWORK_SUPPLIERS=" "$ROOT_ENV"; then
  sed -i.tmp "s|^ENABLE_NETWORK_SUPPLIERS=.*|ENABLE_NETWORK_SUPPLIERS=${NEW_VALUE}|" "$ROOT_ENV"
  rm -f "${ROOT_ENV}.tmp"
else
  echo "ENABLE_NETWORK_SUPPLIERS=${NEW_VALUE}" >> "$ROOT_ENV"
fi

echo -e "${GREEN}✅ .env atualizado: ENABLE_NETWORK_SUPPLIERS=${NEW_VALUE}${NC}"

# -----------------------------------------------------------
# Sincronizar backend/.env (se existir)
# -----------------------------------------------------------
if [ -f "$BACKEND_ENV" ]; then
  if grep -q "^ENABLE_NETWORK_SUPPLIERS=" "$BACKEND_ENV"; then
    sed -i.tmp "s|^ENABLE_NETWORK_SUPPLIERS=.*|ENABLE_NETWORK_SUPPLIERS=${NEW_VALUE}|" "$BACKEND_ENV"
    rm -f "${BACKEND_ENV}.tmp"
  else
    echo "ENABLE_NETWORK_SUPPLIERS=${NEW_VALUE}" >> "$BACKEND_ENV"
  fi
  echo -e "${GREEN}✅ backend/.env sincronizado${NC}"
fi

# -----------------------------------------------------------
# Reiniciar o container backend (se docker compose estiver disponível)
# -----------------------------------------------------------
if command -v docker &> /dev/null && [ -f "$REPO_DIR/docker-compose.yml" ]; then
  echo -e "${YELLOW}Reiniciando container backend para aplicar a flag...${NC}"
  docker compose up -d --force-recreate backend
  echo -e "${GREEN}✅ Backend reiniciado${NC}"
else
  echo -e "${YELLOW}⚠️  Docker não detectado — reinicie o backend manualmente para aplicar a alteração.${NC}"
fi

# -----------------------------------------------------------
# Confirmação final
# -----------------------------------------------------------
echo ""
echo -e "${GREEN}=== Flag aplicada ===${NC}"
print_current
echo ""
echo -e "${YELLOW}Para reverter, restaure o backup:${NC}"
echo "  cp $BACKUP $ROOT_ENV"
