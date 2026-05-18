#!/bin/bash
# =============================================================
# CotaObra — Validação E2E do pipeline PDF → MinIO → WhatsApp
# para uma cotação de FERTILIZANTE com 3 produtos.
#
# Produtos:
#   1. Ureia 46% N            — 50 sacas   (R$ 180/saca base)
#   2. Cloreto de Potássio 60% — 30 sacas   (R$ 220/saca base)
#   3. Superfosfato Simples 18% — 40 sacas (R$ 150/saca base)
#
# Uso:
#   bash scripts/validate-pdf-pipeline-fertilizer.sh <cpf>
#   bash scripts/validate-pdf-pipeline-fertilizer.sh 023.407.661-50
#   bash scripts/validate-pdf-pipeline-fertilizer.sh 02340766150 --no-cleanup
#
# Pré-requisitos:
#   - MinIO configurado (bash scripts/setup-pdf-feature.sh já rodou)
#   - Producer existe com >= 2 suppliers vinculados
#   - Producer.phone está dentro da janela 24h do WhatsApp Business
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

# 3 produtos de fertilizante (formato: "nome:quantidade:unidade:basePrice")
PRODUCTS="Ureia 46% N:50:sacas:180,Cloreto de Potassio 60%:30:sacas:220,Superfosfato Simples 18%:40:sacas:150"

echo ""
echo "============================================="
echo " CotaObra — Validação E2E PDF (Fertilizante)"
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

docker compose exec -T backend node dist/scripts/validate-pdf-pipeline.js \
  --cpf "$CPF" \
  --category fertilizante \
  --products "$PRODUCTS" \
  $EXTRA_ARGS
