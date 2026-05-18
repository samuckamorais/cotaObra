#!/bin/bash

# CotaObra - Script de Restart
# Para e reinicia os containers

set -e

echo "🔄 CotaObra - Reiniciando..."

# Verificar se está no diretório correto
cd "$(dirname "$0")/.."

# Parar e iniciar
docker compose restart

echo ""
echo "✅ Containers reiniciados!"
echo ""
echo "🌐 URLs:"
echo "   Frontend:  http://localhost:5173"
echo "   Backend:   http://localhost:3000"
echo ""
echo "📊 Ver logs: ./scripts/logs.sh"
echo ""
