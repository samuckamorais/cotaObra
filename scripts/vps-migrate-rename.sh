#!/bin/bash

# =============================================================
# CotaObra - Migração de nome: CotaObra → CotaObra
#
# Executa na VPS sem recriar banco ou perder dados.
# Passos:
#   1. Pull do código atualizado
#   2. Para containers antigos (cotaobra-*)
#   3. Sobe apenas postgres e renomeia o banco
#   4. Atualiza DATABASE_URL no .env
#   5. Rebuild e sobe todos os containers
#   6. Executa migrations pendentes
#
# Uso: bash scripts/vps-migrate-rename.sh
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
echo " CotaObra - Migração de nome na VPS"
echo " Diretório: $REPO_DIR"
echo "============================================="
echo ""

# -----------------------------------------------------------
# 1. Pull do repositório
# -----------------------------------------------------------
echo -e "${YELLOW}[1/6] Atualizando código...${NC}"
git pull origin main
echo -e "${GREEN}✅ Código atualizado${NC}"

# -----------------------------------------------------------
# 2. Parar containers antigos
# -----------------------------------------------------------
echo -e "${YELLOW}[2/6] Parando containers antigos...${NC}"

# Tenta parar pelos nomes antigos (cotaobra-*)
for NAME in cotaobra-frontend cotaobra-backend cotaobra-redis cotaobra-postgres; do
  if docker inspect "$NAME" &>/dev/null; then
    echo "  → Parando $NAME"
    docker stop "$NAME" 2>/dev/null || true
    docker rm   "$NAME" 2>/dev/null || true
  fi
done

# Também garante que o docker compose atual não tenha nada rodando
docker compose down 2>/dev/null || true

echo -e "${GREEN}✅ Containers parados${NC}"

# -----------------------------------------------------------
# 3. Subir apenas o postgres e renomear o banco
# -----------------------------------------------------------
echo -e "${YELLOW}[3/6] Iniciando PostgreSQL para migração do banco...${NC}"
docker compose up -d postgres

# Aguardar postgres estar pronto
echo "  → Aguardando PostgreSQL..."
RETRIES=20
until docker compose exec -T postgres pg_isready -U postgres &>/dev/null; do
  RETRIES=$((RETRIES-1))
  [ $RETRIES -eq 0 ] && echo -e "${RED}❌ PostgreSQL não respondeu.${NC}" && exit 1
  sleep 2
done
echo -e "${GREEN}✅ PostgreSQL pronto${NC}"

# Verificar e renomear banco
BANCO_ANTIGO=$(docker compose exec -T postgres psql -U postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname='cotaobra';" 2>/dev/null | tr -d ' \r\n')

BANCO_NOVO=$(docker compose exec -T postgres psql -U postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname='cotaobra';" 2>/dev/null | tr -d ' \r\n')

if [ "$BANCO_ANTIGO" = "1" ] && [ "$BANCO_NOVO" != "1" ]; then
  echo "  → Renomeando banco: cotaobra → cotaobra"
  docker compose exec -T postgres psql -U postgres \
    -c "ALTER DATABASE cotaobra RENAME TO cotaobra;"
  echo -e "${GREEN}✅ Banco renomeado com sucesso (dados preservados)${NC}"

elif [ "$BANCO_NOVO" = "1" ]; then
  echo -e "${GREEN}✅ Banco cotaobra já existe, nenhuma ação necessária${NC}"

else
  echo -e "${YELLOW}⚠️  Nenhum banco encontrado (cotaobra nem cotaobra).${NC}"
  echo -e "${YELLOW}   O postgres criará o banco cotaobra automaticamente na inicialização.${NC}"
fi

# -----------------------------------------------------------
# 4. Atualizar DATABASE_URL no .env
#    ATENÇÃO: apenas DATABASE_URL é alterada.
#    Variáveis como EVOLUTION_INSTANCE_NAME, REDIS_URL, etc.
#    apontam para recursos externos e NÃO devem ser renomeadas.
# -----------------------------------------------------------
echo -e "${YELLOW}[4/6] Atualizando .env...${NC}"

if [ -f ".env" ]; then
  # Normalizar CRLF
  sed -i 's/\r//' .env

  # Atualizar apenas DATABASE_URL (recurso interno gerenciado pelo compose)
  if grep -q "^DATABASE_URL=.*cotaobra" .env || grep -q "^DATABASE_URL=.*cotaObra" .env; then
    sed -i 's|^\(DATABASE_URL=.*\)cotaobra|\1cotaobra|g' .env
    sed -i 's|^\(DATABASE_URL=.*\)cotaObra|\1cotaobra|g' .env
    echo -e "${GREEN}✅ DATABASE_URL atualizada para cotaobra${NC}"
  else
    echo -e "${GREEN}✅ DATABASE_URL já está correta ou não presente no .env${NC}"
  fi

  echo "  DATABASE_URL atual:"
  grep "^DATABASE_URL" .env || echo "  (não encontrado no .env — será injetado pelo docker-compose.yml)"

  echo ""
  echo -e "${YELLOW}  ℹ️  Variáveis NÃO alteradas (recursos externos):${NC}"
  grep -E "^EVOLUTION_INSTANCE_NAME|^REDIS_URL|^WEBHOOK_URL" .env 2>/dev/null || true
else
  echo -e "${YELLOW}⚠️  Arquivo .env não encontrado — pulando${NC}"
fi

# -----------------------------------------------------------
# 5. Rebuild e subir todos os containers
# -----------------------------------------------------------
echo -e "${YELLOW}[5/6] Fazendo build e subindo todos os containers...${NC}"
docker compose up -d --build
echo -e "${GREEN}✅ Containers iniciados${NC}"

# Aguardar backend ficar pronto
echo "  → Aguardando backend inicializar..."
sleep 8
RETRIES=15
until curl -s http://localhost:3000/health &>/dev/null || [ $RETRIES -eq 0 ]; do
  RETRIES=$((RETRIES-1))
  sleep 3
done

# -----------------------------------------------------------
# 6. Migrations e Prisma Client
# -----------------------------------------------------------
echo -e "${YELLOW}[6/6] Executando migrations pendentes...${NC}"

docker compose exec -T backend npx prisma migrate deploy
echo -e "${GREEN}✅ Migrations aplicadas${NC}"

docker compose exec -T backend npx prisma generate
echo -e "${GREEN}✅ Prisma Client gerado${NC}"

# -----------------------------------------------------------
# Status final
# -----------------------------------------------------------
echo ""
echo "============================================="
docker compose ps
echo "============================================="
echo ""
echo -e "${GREEN}✅ Migração concluída! Projeto renomeado para CotaObra.${NC}"
echo ""

PUBLIC_IP=$(curl -4 -s --max-time 3 ifconfig.me || echo "seu-ip")
echo "URLs:"
echo "  Frontend:  http://${PUBLIC_IP}:5173"
echo "  Backend:   http://${PUBLIC_IP}:3000"
echo "  Health:    http://${PUBLIC_IP}:3000/health"
echo ""
echo "Se algo falhar:"
echo "  Ver logs postgres: docker compose logs postgres"
echo "  Ver logs backend:  docker compose logs backend | tail -50"
echo ""
