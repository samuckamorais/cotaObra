#!/bin/bash

# CotaObra - Script de Reset Completo
# Para containers e remove volumes (CUIDADO: apaga dados!)

set -e

echo "🌾 CotaObra - Reset Completo"
echo "=============================="
echo ""
echo "⚠️  ATENÇÃO: Este comando irá:"
echo "   - Parar todos os containers"
echo "   - Remover todos os volumes"
echo "   - APAGAR todos os dados do banco"
echo ""
read -p "Tem certeza? (digite 'sim' para confirmar): " confirm

if [ "$confirm" != "sim" ]; then
    echo "❌ Operação cancelada"
    exit 0
fi

# Verificar se está no diretório correto
cd "$(dirname "$0")/.."

echo ""
echo "🛑 Parando e removendo containers..."
docker compose down -v

echo ""
echo "✅ Reset completo!"
echo ""
echo "🚀 Para configurar novamente: ./scripts/setup.sh"
echo ""
