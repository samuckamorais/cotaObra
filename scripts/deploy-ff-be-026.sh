#!/bin/bash
# =============================================================
# CotaObra — Deploy do FF-BE-026
# Bugfix: Vínculo User-Producer + Isolamento de Acesso
#
# Uso:
#   bash scripts/deploy-ff-be-026.sh                      # deploy completo (com migração legacy)
#   bash scripts/deploy-ff-be-026.sh --skip-data-migration # apenas atualiza código (re-execução)
#   bash scripts/deploy-ff-be-026.sh --only-data-migration # apenas roda migração legacy (rerun seguro)
#
# Fluxo padrão:
#   1. git pull
#   2. docker compose up -d --build backend
#   3. healthcheck (/health/live)
#   4. Migração legacy: npm run migrate:producer-links (idempotente)
#   5. Resumo final + telemetria
#
# Não há migration de schema nova nesta task — apenas mudança de
# código (ProducerService refatorado + isolamento por papel) e um
# script de dados idempotente para linkar producers/users legacy
# que ficaram órfãos antes do fix.
#
# Pós-deploy verificar:
#   - USER criando 2º producer recebe 409
#   - USER acessando producer alheio recebe 404
#   - ADMIN continua vendo todos do tenant
#   - Logs com producer_auto_linked_to_user / producer_isolation_violation_attempted
# =============================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

SKIP_DATA_MIGRATION=false
ONLY_DATA_MIGRATION=false

for arg in "$@"; do
  case "$arg" in
    --skip-data-migration) SKIP_DATA_MIGRATION=true ;;
    --only-data-migration) ONLY_DATA_MIGRATION=true ;;
    -h|--help)
      sed -n '2,30p' "$0" | sed 's/^# *//'
      exit 0
      ;;
    *) echo -e "${RED}Argumento desconhecido: $arg${NC}"; exit 1 ;;
  esac
done

echo ""
echo "============================================="
echo " CotaObra — Deploy FF-BE-026"
echo " Bugfix: Vínculo User-Producer + Isolamento"
echo " Diretório: $REPO_DIR"
echo "============================================="
echo ""

# -----------------------------------------------------------
# Modo "apenas migração legacy" — atalho para re-execução
# -----------------------------------------------------------
if [ "$ONLY_DATA_MIGRATION" = true ]; then
  echo -e "${BLUE}[modo --only-data-migration] Rodando migração legacy...${NC}"
  docker compose exec -T backend npm run migrate:producer-links
  echo -e "${GREEN}✅ Migração concluída.${NC}"
  exit 0
fi

# -----------------------------------------------------------
# 1. Pull
# -----------------------------------------------------------
echo -e "${YELLOW}[1/4] Atualizando código (git pull)...${NC}"
git pull --ff-only origin main
echo -e "${GREEN}✅ Código atualizado${NC}"
echo ""

# -----------------------------------------------------------
# 2. Build + up backend
# -----------------------------------------------------------
echo -e "${YELLOW}[2/4] Buildando e subindo backend...${NC}"
docker compose up -d --build backend
echo -e "${GREEN}✅ Backend rodando${NC}"
echo ""

# -----------------------------------------------------------
# 3. Healthcheck
# -----------------------------------------------------------
echo -e "${YELLOW}[3/4] Aguardando backend ficar saudável...${NC}"
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
# 4. Migração legacy de producers/users órfãos
# -----------------------------------------------------------
if [ "$SKIP_DATA_MIGRATION" = true ]; then
  echo -e "${BLUE}[4/4] Pulando migração legacy (--skip-data-migration)${NC}"
  echo -e "${BLUE}     Para rodar depois: bash scripts/deploy-ff-be-026.sh --only-data-migration${NC}"
else
  echo -e "${YELLOW}[4/4] Migração legacy: linkando producers/users órfãos...${NC}"
  echo "    Idempotente — rerun é seguro (não duplica vínculos)."
  echo "    Casos ambíguos vão para log WARN para revisão manual."
  docker compose exec -T backend npm run migrate:producer-links
  echo -e "${GREEN}✅ Migração concluída${NC}"
fi
echo ""

# -----------------------------------------------------------
# Resumo final
# -----------------------------------------------------------
echo "============================================="
echo -e " ${GREEN}Deploy FF-BE-026 concluído.${NC}"
echo "============================================="
echo ""
echo "Validação rápida pós-deploy:"
echo "  # USER tentando criar 2º producer (esperado: 409)"
echo "  curl -X POST https://<api>/api/producers -H 'Authorization: Bearer <token-user-ja-vinculado>' \\"
echo "    -H 'Content-Type: application/json' -d '{\"name\":\"X\",\"phone\":\"+5564999999999\",\"cpfCnpj\":\"123\"}'"
echo ""
echo "  # USER acessando producer alheio (esperado: 404)"
echo "  curl https://<api>/api/producers/<id-alheio> -H 'Authorization: Bearer <token-user>'"
echo ""
echo "Telemetria a monitorar nos logs (docker compose logs backend):"
echo "  - producer_auto_linked_to_user           (auto-link em /api/producers POST)"
echo "  - producer_create_blocked_already_linked (409 — USER já tem producer)"
echo "  - producer_isolation_violation_attempted (USER tentou acessar producer alheio)"
echo ""
echo "Revisão manual de tenants ambíguos (se houver):"
echo "  docker compose logs backend | grep 'Tenant requires manual review'"
echo ""
echo "Docs: backend/docs/USER_PRODUCER_ISOLATION.md"
echo ""
