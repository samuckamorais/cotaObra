#!/bin/bash

# CotaObra - Script de Logs
# Mostra logs dos containers

# Verificar se está no diretório correto
cd "$(dirname "$0")/.."

# Verificar se há argumentos
if [ -z "$1" ]; then
    echo "🌾 CotaObra - Logs (todos os serviços)"
    echo "Pressione Ctrl+C para sair"
    echo ""
    docker compose logs -f
else
    echo "🌾 CotaObra - Logs ($1)"
    echo "Pressione Ctrl+C para sair"
    echo ""
    docker compose logs -f "$1"
fi
