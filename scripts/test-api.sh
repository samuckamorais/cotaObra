#!/bin/bash

# CotaObra - Script de Teste da API
# Testa os principais endpoints

set -e

echo "🌾 CotaObra - Teste da API"
echo "=============================="
echo ""

BASE_URL="http://localhost:3000"

# Cores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Função para testar endpoint
test_endpoint() {
    local name=$1
    local url=$2
    local expected_code=${3:-200}

    echo -n "Testing $name... "

    response_code=$(curl -s -o /dev/null -w "%{http_code}" "$url")

    if [ "$response_code" -eq "$expected_code" ]; then
        echo -e "${GREEN}✅ OK (HTTP $response_code)${NC}"
        return 0
    else
        echo -e "${RED}❌ FAIL (HTTP $response_code, expected $expected_code)${NC}"
        return 1
    fi
}

# Testar Health Check
test_endpoint "Health Check" "$BASE_URL/health" 200

echo ""
echo "📊 Testar outros endpoints requer autenticação JWT"
echo ""
echo "Para obter um token:"
echo "1. Solicite OTP:"
echo "   curl -X POST $BASE_URL/api/auth/otp \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"phone\": \"+5564999999999\"}'"
echo ""
echo "2. Faça login com o código recebido:"
echo "   curl -X POST $BASE_URL/api/auth/login \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"phone\": \"+5564999999999\", \"code\": \"123456\"}'"
echo ""
echo "3. Use o token retornado nos próximos requests:"
echo "   curl $BASE_URL/api/dashboard \\"
echo "     -H 'Authorization: Bearer SEU_TOKEN'"
echo ""
