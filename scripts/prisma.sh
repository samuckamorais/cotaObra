#!/bin/bash

# CotaObra - Script de Comandos Prisma
# Facilita execução de comandos Prisma no container

# Verificar se está no diretório correto
cd "$(dirname "$0")/.."

if [ -z "$1" ]; then
    echo "🌾 CotaObra - Comandos Prisma"
    echo ""
    echo "Uso: ./scripts/prisma.sh <comando>"
    echo ""
    echo "Comandos disponíveis:"
    echo "  studio    - Abre Prisma Studio (GUI do banco)"
    echo "  migrate   - Executa migrations"
    echo "  seed      - Popula banco com dados de exemplo"
    echo "  generate  - Gera Prisma Client"
    echo "  reset     - Reset completo do banco (CUIDADO!)"
    echo ""
    exit 1
fi

case "$1" in
    studio)
        echo "🎨 Abrindo Prisma Studio..."
        echo "Acesse: http://localhost:5555"
        docker compose exec backend npx prisma studio
        ;;
    migrate)
        echo "📊 Executando migrations..."
        docker compose exec backend npx prisma migrate dev
        ;;
    seed)
        echo "🌱 Populando banco..."
        docker compose exec backend npm run prisma:seed
        ;;
    generate)
        echo "🔧 Gerando Prisma Client..."
        docker compose exec backend npx prisma generate
        ;;
    reset)
        echo "⚠️  CUIDADO: Isto irá APAGAR todos os dados!"
        read -p "Tem certeza? (digite 'sim'): " confirm
        if [ "$confirm" = "sim" ]; then
            docker compose exec backend npx prisma migrate reset
        else
            echo "❌ Operação cancelada"
        fi
        ;;
    *)
        echo "❌ Comando desconhecido: $1"
        echo "Execute sem argumentos para ver comandos disponíveis"
        exit 1
        ;;
esac
