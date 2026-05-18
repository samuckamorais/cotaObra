#!/bin/bash
# =============================================================
# CotaObra — Deploy do FEAT-007 (Smart Quote)
# Sprint 1 + 1.5 + Sprint 2 (sem FF-BE-020 / Whisper, adiado).
#
# Uso:
#   bash scripts/deploy-feat-007.sh                     # deploy completo
#   bash scripts/deploy-feat-007.sh --enable-smart-fill # liga a flag (apenas após baseline de 3 dias)
#   bash scripts/deploy-feat-007.sh --skip-seeds        # deploy sem rodar seeds (re-execução)
#
# Fluxo padrão:
#   1. git pull
#   2. prisma migrate deploy (fsm_events + product_category_mappings)
#   3. docker compose up -d --build backend
#   4. seed product->category (FF-BE-011)
#   5. populador retroativo de lastQuotePreferences (FF-BE-015)
#   6. healthcheck final
#
# A flag SMART_FILL_ENABLED permanece false após o deploy. Liga só
# depois dos 3 dias úteis de baseline em FSMEvent (decisão do PO).
# =============================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

ENABLE_SMART_FILL=false
SKIP_SEEDS=false
ONLY_FLIP=false

for arg in "$@"; do
  case "$arg" in
    --enable-smart-fill) ENABLE_SMART_FILL=true ;;
    --skip-seeds)        SKIP_SEEDS=true ;;
    --only-flip)         ONLY_FLIP=true; ENABLE_SMART_FILL=true ;;
    -h|--help)
      sed -n '2,20p' "$0" | sed 's/^# *//'
      exit 0
      ;;
    *) echo -e "${RED}Argumento desconhecido: $arg${NC}"; exit 1 ;;
  esac
done

echo ""
echo "============================================="
echo " CotaObra — Deploy FEAT-007 (Smart Quote)"
echo " Diretório: $REPO_DIR"
echo "============================================="
echo ""

# -----------------------------------------------------------
# Modo "apenas ligar smart fill" — atalho para pós-baseline
# -----------------------------------------------------------
if [ "$ONLY_FLIP" = true ]; then
  echo -e "${BLUE}[modo --only-flip] Ligando SMART_FILL_ENABLED no .env...${NC}"
  if grep -q '^SMART_FILL_ENABLED=' .env; then
    sed -i 's|^SMART_FILL_ENABLED=.*|SMART_FILL_ENABLED=true|' .env
  else
    echo 'SMART_FILL_ENABLED=true' >> .env
  fi
  echo -e "${GREEN}✅ Flag ligada.${NC}"
  echo -e "${YELLOW}Recriando container backend para recarregar env...${NC}"
  docker compose up -d --force-recreate backend
  echo -e "${GREEN}✅ Smart Fill ativo.${NC}"
  exit 0
fi

# -----------------------------------------------------------
# 1. Pull
# -----------------------------------------------------------
echo -e "${YELLOW}[1/6] Atualizando código (git pull)...${NC}"
git pull --ff-only origin main
echo -e "${GREEN}✅ Código atualizado${NC}"
echo ""

# -----------------------------------------------------------
# 2. Build + up backend (PRECISA vir antes das migrations: o container
#    novo carrega o schema.prisma e as pastas de migrations atualizadas)
# -----------------------------------------------------------
echo -e "${YELLOW}[2/6] Buildando e subindo backend...${NC}"
docker compose up -d --build backend
echo -e "${GREEN}✅ Backend rodando${NC}"
echo ""

# Aguarda backend ficar saudável
echo -e "${YELLOW}    Aguardando backend ficar saudável...${NC}"
RETRIES=20
until docker compose exec -T backend wget --no-verbose --tries=1 --spider http://localhost:3000/health/live &>/dev/null \
      || [ $RETRIES -eq 0 ]; do
  printf "."
  RETRIES=$((RETRIES-1))
  sleep 2
done
echo ""
if [ $RETRIES -eq 0 ]; then
  echo -e "${RED}❌ Backend não respondeu ao healthcheck. Verifique logs:${NC}"
  echo "    docker compose logs backend"
  exit 1
fi
echo -e "${GREEN}✅ Backend saudável${NC}"
echo ""

# -----------------------------------------------------------
# 3. Migrations Prisma (depois do build — schema novo disponível)
# -----------------------------------------------------------
echo -e "${YELLOW}[3/6] Aplicando migrations Prisma...${NC}"
echo "    - 20260508000000_add_fsm_events_table       (FF-BE-009)"
echo "    - 20260508000001_add_product_category_mappings (FF-BE-011)"
docker compose exec -T backend npx prisma migrate deploy
echo -e "${GREEN}✅ Migrations aplicadas${NC}"
echo ""

# -----------------------------------------------------------
# 4. Seed: dicionário Produto → Categoria (FF-BE-011)
# -----------------------------------------------------------
if [ "$SKIP_SEEDS" = true ]; then
  echo -e "${BLUE}[4/6] Pulando seeds (--skip-seeds)${NC}"
else
  echo -e "${YELLOW}[4/6] Seed do dicionário Produto → Categoria (FF-BE-011)${NC}"
  docker compose cp backend/scripts/seed-product-category-mappings.js \
    backend:/app/seed-pcm.js
  docker compose exec -T backend node /app/seed-pcm.js
  echo -e "${GREEN}✅ Seed concluído${NC}"
fi
echo ""

# -----------------------------------------------------------
# 5. Populador retroativo de lastQuotePreferences (FF-BE-015)
# -----------------------------------------------------------
if [ "$SKIP_SEEDS" = true ]; then
  echo -e "${BLUE}[5/6] Pulando populador (--skip-seeds)${NC}"
else
  echo -e "${YELLOW}[5/6] Populador retroativo de lastQuotePreferences (FF-BE-015)${NC}"
  docker compose cp backend/scripts/populate-last-quote-preferences.js \
    backend:/app/populate-lqp.js
  docker compose exec -T backend node /app/populate-lqp.js
  echo -e "${GREEN}✅ Populador concluído${NC}"
fi
echo ""

# -----------------------------------------------------------
# 6. Liga SMART_FILL_ENABLED se solicitado
# -----------------------------------------------------------
if [ "$ENABLE_SMART_FILL" = true ]; then
  echo -e "${YELLOW}[6/6] Ligando SMART_FILL_ENABLED no .env...${NC}"
  if grep -q '^SMART_FILL_ENABLED=' .env; then
    sed -i 's|^SMART_FILL_ENABLED=.*|SMART_FILL_ENABLED=true|' .env
  else
    echo 'SMART_FILL_ENABLED=true' >> .env
  fi
  docker compose up -d --force-recreate backend
  echo -e "${GREEN}✅ SMART_FILL_ENABLED=true (smart fill ativo)${NC}"
else
  echo -e "${BLUE}[6/6] SMART_FILL_ENABLED permanece false (gate de baseline).${NC}"
  echo -e "${BLUE}     Para ligar após 3 dias úteis:${NC}"
  echo "       bash scripts/deploy-feat-007.sh --only-flip"
fi
echo ""

# -----------------------------------------------------------
# Resumo final
# -----------------------------------------------------------
echo "============================================="
echo -e " ${GREEN}Deploy FEAT-007 concluído.${NC}"
echo "============================================="
echo ""
echo "Confirmar variáveis no container:"
echo "  docker compose exec backend printenv SMART_FILL_ENABLED"
echo "  docker compose exec backend printenv ENABLE_NETWORK_SUPPLIERS"
echo ""
echo "Acompanhar telemetria do funil (FF-BE-009):"
echo "  GET /api/reports/conversational-funnel?from=YYYY-MM-DD&to=YYYY-MM-DD"
echo ""
echo "Pendente para deploy futuro (branch separada):"
echo "  FF-BE-020 — Whisper + FFmpeg (transcrição de áudio)"
echo ""
