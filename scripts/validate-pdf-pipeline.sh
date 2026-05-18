#!/bin/bash
# =============================================================
# CotaObra — Validação E2E do pipeline PDF → MinIO → WhatsApp
#
# Cria uma cotação fake para o producer informado, gera propostas
# fictícias dos suppliers vinculados, fecha a cotação no menor preço
# e acompanha o pipeline até o producer receber o PDF no WhatsApp.
#
# Uso:
#   bash scripts/validate-pdf-pipeline.sh <cpf>
#   bash scripts/validate-pdf-pipeline.sh 023.407.661-50
#   bash scripts/validate-pdf-pipeline.sh 02340766150 --no-cleanup
#   bash scripts/validate-pdf-pipeline.sh 02340766150 --dry-run
#
# Pré-requisitos:
#   - MinIO configurado (bash scripts/setup-pdf-feature.sh já rodou)
#   - Producer existe e tem >= 2 suppliers vinculados
#   - Producer.phone está em formato E.164 e fez opt-in no Twilio
# =============================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

if [ -z "$1" ]; then
  echo -e "${RED}Uso: bash $0 <cpf> [--no-cleanup] [--dry-run] [--timeout 60]${NC}"
  exit 1
fi

CPF="$1"
shift
EXTRA_ARGS="$@"

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

echo ""
echo "============================================="
echo " CotaObra — Validação E2E PDF Pipeline"
echo " CPF: $CPF"
echo "============================================="
echo ""

echo -e "${YELLOW}Verificando backend...${NC}"
if ! docker compose ps backend | grep -q 'running\|Up'; then
  echo -e "${RED}❌ Container backend não está rodando.${NC}"
  echo "   docker compose up -d backend"
  exit 1
fi
echo -e "${GREEN}✅ Backend rodando${NC}"
echo ""

echo -e "${YELLOW}Verificando MinIO...${NC}"
if ! docker compose ps minio | grep -q 'running\|Up'; then
  echo -e "${RED}❌ Container minio não está rodando.${NC}"
  echo "   bash scripts/setup-pdf-feature.sh"
  exit 1
fi
echo -e "${GREEN}✅ MinIO rodando${NC}"
echo ""

# Executa o script dentro do container backend
docker compose exec -T backend node dist/scripts/validate-pdf-pipeline.js \
  --cpf "$CPF" $EXTRA_ARGS
