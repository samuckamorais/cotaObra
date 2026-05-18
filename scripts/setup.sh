#!/bin/bash

# CotaObra - Script de Setup Completo
# Este script configura e inicia a aplicação do zero

set -e

echo "🌾 CotaObra - Setup Completo"
echo "=============================="
echo ""

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Verificar se está no diretório correto
if [ ! -f "docker-compose.yml" ]; then
    echo -e "${RED}❌ Erro: docker-compose.yml não encontrado${NC}"
    echo "Execute este script a partir da raiz do projeto"
    exit 1
fi

# Verificar se Docker está instalado
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker não está instalado${NC}"
    echo "Instale o Docker em: https://www.docker.com/get-started"
    exit 1
fi

# Verificar se Docker Compose está disponível
if ! docker compose version &> /dev/null; then
    echo -e "${RED}❌ Docker Compose não está disponível${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Docker verificado${NC}"
echo ""

# Parar containers existentes
echo "🛑 Parando containers existentes..."
docker compose down -v 2>/dev/null || true
echo ""

# Criar arquivo .env se não existir
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  Arquivo .env não encontrado${NC}"
    echo "📝 Copiando .env.example para .env..."
    cp .env.example .env
    echo -e "${GREEN}✅ Arquivo .env criado${NC}"
    echo ""
    echo -e "${YELLOW}⚠️  IMPORTANTE: Configure as variáveis de ambiente em .env${NC}"
    echo "   Especialmente:"
    echo "   - TWILIO_* (para WhatsApp)"
    echo "   - OPENAI_API_KEY (para NLU)"
    echo ""
    read -p "Pressione ENTER para continuar..."
fi

# Subir containers
echo "🚀 Iniciando containers Docker..."
docker compose up -d

echo ""
echo "⏳ Aguardando serviços iniciarem (30 segundos)..."
sleep 30

# Verificar se containers estão rodando
echo ""
echo "🔍 Verificando containers..."
docker compose ps

# Rodar migrations
echo ""
echo "📊 Executando migrations do banco de dados..."
docker compose exec -T backend npx prisma migrate dev --name init

# Gerar Prisma Client
echo ""
echo "🔧 Gerando Prisma Client..."
docker compose exec -T backend npx prisma generate

# Popular banco de dados
echo ""
echo "🌱 Populando banco de dados com dados de exemplo..."
docker compose exec -T backend npm run prisma:seed

# Verificar saúde da API
echo ""
echo "🏥 Verificando saúde da API..."
sleep 5

if curl -s http://localhost:3000/health > /dev/null; then
    echo -e "${GREEN}✅ API está respondendo!${NC}"
else
    echo -e "${YELLOW}⚠️  API não está respondendo ainda. Aguarde mais alguns segundos.${NC}"
fi

echo ""
echo "=============================="
echo -e "${GREEN}✅ Setup completo!${NC}"
echo "=============================="
echo ""
echo "🌐 URLs:"
echo "   Frontend:  http://localhost:5173"
echo "   Backend:   http://localhost:3000"
echo "   Health:    http://localhost:3000/health"
echo ""
echo "📊 Comandos úteis:"
echo "   Ver logs:        ./scripts/logs.sh"
echo "   Parar:           ./scripts/stop.sh"
echo "   Reiniciar:       ./scripts/restart.sh"
echo "   Reset completo:  ./scripts/reset.sh"
echo ""
echo "📚 Documentação: README.md e QUICKSTART.md"
echo ""
