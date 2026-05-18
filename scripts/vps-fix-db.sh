#!/bin/bash

# =============================================================
# CotaObra - Script de Correção do Banco de Dados
# Execute quando houver problemas de login ou dados
# =============================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

echo ""
echo "============================================="
echo " CotaObra - Correção do Banco de Dados"
echo "============================================="
echo ""

# -----------------------------------------------------------
# Verificar se os containers estão rodando
# -----------------------------------------------------------
if ! docker compose ps | grep -q "backend.*running"; then
  echo -e "${RED}❌ Container backend não está rodando!${NC}"
  echo -e "${YELLOW}Execute: docker compose up -d${NC}"
  exit 1
fi

# -----------------------------------------------------------
# 1. Gerar Prisma Client
# -----------------------------------------------------------
echo -e "${YELLOW}[1/3] Gerando Prisma Client...${NC}"
docker compose exec -T backend npx prisma generate
echo -e "${GREEN}✅ Prisma Client gerado${NC}"

# -----------------------------------------------------------
# 2. Aplicar Migrations
# -----------------------------------------------------------
echo -e "${YELLOW}[2/3] Aplicando migrations...${NC}"
docker compose exec -T backend npx prisma migrate deploy
echo -e "${GREEN}✅ Migrations aplicadas${NC}"

# -----------------------------------------------------------
# 3. Verificar e criar usuário Admin
# -----------------------------------------------------------
echo -e "${YELLOW}[3/3] Verificando usuário Admin...${NC}"

# Verificar se usuário admin existe
ADMIN_EXISTS=$(docker compose exec -T postgres psql -U postgres -d cotaobra -tAc \
  "SELECT COUNT(*) FROM \"User\" WHERE email='admin@cotaobra.com';" 2>/dev/null || echo "0")

if [ "$(echo $ADMIN_EXISTS | tr -d ' ')" = "0" ]; then
  echo -e "${YELLOW}Usuário Admin não encontrado. Criando...${NC}"
  docker compose exec -T backend npm run prisma:seed
  echo -e "${GREEN}✅ Usuário Admin criado${NC}"
else
  echo -e "${GREEN}✅ Usuário Admin já existe${NC}"
fi

# -----------------------------------------------------------
# 4. Reiniciar backend
# -----------------------------------------------------------
echo -e "${YELLOW}Reiniciando backend...${NC}"
docker compose restart backend
sleep 3
echo -e "${GREEN}✅ Backend reiniciado${NC}"

# -----------------------------------------------------------
# Status final
# -----------------------------------------------------------
echo ""
echo "============================================="
echo -e "${GREEN}✅ Correção concluída!${NC}"
echo "============================================="
echo ""
echo -e "${GREEN}Credenciais para login:${NC}"
echo "  Email: admin@cotaobra.com"
echo "  Senha: Farmflow0147*"
echo ""
echo "Verifique os logs se ainda houver problemas:"
echo "  docker compose logs -f backend"
echo ""
