#!/bin/bash

# CotaObra - Script de Start
# Inicia os containers (assume que já foram configurados)

set -e

echo "🌾 CotaObra - Iniciando..."

# Verificar se está no diretório correto
cd "$(dirname "$0")/.."

# Subir containers
docker compose up -d

echo ""
echo "✅ Containers iniciados!"
echo ""
echo "🌐 URLs:"
echo "   Frontend:  http://localhost:5173"
echo "   Backend:   http://localhost:3000"
echo ""
echo "📊 Ver logs: ./scripts/logs.sh"
echo ""
