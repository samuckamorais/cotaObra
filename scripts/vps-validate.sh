#!/bin/bash

# =============================================================
# CotaObra - Validação Pós-Deploy
# Verifica se todos os serviços estão funcionando corretamente
# Execute: bash scripts/vps-validate.sh
# =============================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

echo ""
echo "============================================="
echo " CotaObra - Validação Pós-Deploy"
echo "============================================="
echo ""

FAILED_CHECKS=0
PASSED_CHECKS=0

# Helper function para checks
check() {
  local test_name="$1"
  local test_command="$2"

  echo -ne "${BLUE}Testando: $test_name...${NC} "

  if eval "$test_command" &> /dev/null; then
    echo -e "${GREEN}✅ OK${NC}"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
    return 0
  else
    echo -e "${RED}❌ FALHOU${NC}"
    FAILED_CHECKS=$((FAILED_CHECKS + 1))
    return 1
  fi
}

# -----------------------------------------------------------
# 1. Containers
# -----------------------------------------------------------
echo -e "${YELLOW}[1/6] Verificando containers...${NC}"

check "Container postgres rodando" "docker compose ps postgres | grep -q 'Up'"
check "Container redis rodando" "docker compose ps redis | grep -q 'Up'"
check "Container backend rodando" "docker compose ps backend | grep -q 'Up'"
check "Container frontend rodando" "docker compose ps frontend | grep -q 'Up'"

echo ""

# -----------------------------------------------------------
# 2. Conectividade de Rede
# -----------------------------------------------------------
echo -e "${YELLOW}[2/6] Verificando conectividade...${NC}"

check "PostgreSQL responde" "docker compose exec -T postgres pg_isready -U postgres"
check "Redis responde" "docker compose exec -T redis redis-cli ping | grep -q 'PONG'"

echo ""

# -----------------------------------------------------------
# 3. Backend Health
# -----------------------------------------------------------
echo -e "${YELLOW}[3/6] Verificando backend...${NC}"

check "Backend health endpoint" "curl -s http://localhost:3000/health | grep -q 'ok'"
check "Backend porta 3000 aberta" "nc -z localhost 3000"

# Testar endpoints críticos (sem autenticação)
check "Endpoint auth/login existe" "curl -s -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{\"email\":\"test\",\"password\":\"test\"}' | grep -q 'error\|email'"

echo ""

# -----------------------------------------------------------
# 4. Banco de Dados
# -----------------------------------------------------------
echo -e "${YELLOW}[4/6] Verificando banco de dados...${NC}"

# Verificar tabelas críticas
CRITICAL_TABLES=("User" "Producer" "Supplier" "Quote" "Proposal" "Subscription")

for table in "${CRITICAL_TABLES[@]}"; do
  check "Tabela '$table' existe" "docker compose exec -T postgres psql -U postgres -d cotaobra -tAc \"SELECT COUNT(*) FROM information_schema.tables WHERE table_name='$table';\" | grep -q '1'"
done

# Verificar se Admin existe
check "Usuário Admin criado" "docker compose exec -T postgres psql -U postgres -d cotaobra -tAc \"SELECT COUNT(*) FROM \\\"User\\\" WHERE email='admin@cotaobra.com';\" | grep -q -E '[1-9]'"

echo ""

# -----------------------------------------------------------
# 5. Frontend
# -----------------------------------------------------------
echo -e "${YELLOW}[5/6] Verificando frontend...${NC}"

check "Frontend porta 5173 aberta" "nc -z localhost 5173"
check "Frontend responde" "curl -s http://localhost:5173 | grep -q 'html'"

# Verificar se arquivos críticos foram buildados (se em produção)
if [ -d "frontend/dist" ]; then
  check "Build do frontend existe" "[ -f frontend/dist/index.html ]"
fi

echo ""

# -----------------------------------------------------------
# 6. Módulos do Backend
# -----------------------------------------------------------
echo -e "${YELLOW}[6/6] Verificando módulos do backend...${NC}"

BACKEND_MODULES=("auth" "producers" "suppliers" "quotes" "subscriptions" "dashboard" "users")

for module in "${BACKEND_MODULES[@]}"; do
  check "Módulo '$module' existe" "[ -d backend/src/modules/$module ]"
done

# Verificar se subscriptions routes foram registradas
check "Módulo subscriptions no app.ts" "grep -q 'subscriptions' backend/src/app.ts"

echo ""

# -----------------------------------------------------------
# Resumo Final
# -----------------------------------------------------------
echo "============================================="
echo " Resumo da Validação"
echo "============================================="
echo ""

TOTAL_CHECKS=$((PASSED_CHECKS + FAILED_CHECKS))

echo -e "${GREEN}✅ Checks Aprovados: $PASSED_CHECKS${NC}"
echo -e "${RED}❌ Checks Falharam:  $FAILED_CHECKS${NC}"
echo -e "   Total:           $TOTAL_CHECKS"
echo ""

if [ $FAILED_CHECKS -eq 0 ]; then
  echo -e "${GREEN}🎉 Todos os checks passaram! Sistema operacional.${NC}"
  echo ""
  echo "Próximos passos:"
  echo "  1. Acesse o frontend: http://$(curl -s ifconfig.me):5173"
  echo "  2. Faça login com: admin@cotaobra.com / Farmflow0147*"
  echo "  3. Configure seu primeiro produtor"
  echo "  4. Configure integração WhatsApp (TWILIO_WHATSAPP_NUMBER)"
  echo ""
  exit 0
else
  echo -e "${RED}⚠️  Alguns checks falharam. Revise os logs:${NC}"
  echo ""
  echo "Comandos de debug:"
  echo "  docker compose ps                    # Ver status dos containers"
  echo "  docker compose logs backend          # Logs do backend"
  echo "  docker compose logs frontend         # Logs do frontend"
  echo "  docker compose logs postgres         # Logs do banco"
  echo ""
  echo "Scripts de correção:"
  echo "  bash scripts/vps-fix-db.sh          # Corrigir problemas de banco"
  echo "  docker compose restart              # Reiniciar tudo"
  echo ""
  exit 1
fi
