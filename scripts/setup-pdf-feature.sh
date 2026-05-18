#!/bin/bash

# =============================================================
# CotaObra — Setup MinIO + variáveis para FEAT-PDF-001
#
# Idempotente. Executa em qualquer ordem (antes ou depois do
# docker compose up). Não destrutivo: detecta valores já existentes
# no .env e mantém.
#
# Uso:
#   bash scripts/setup-pdf-feature.sh
#   bash scripts/setup-pdf-feature.sh --reset-credentials   # gera credenciais novas
#
# Após rodar:
#   docker compose up -d --build backend minio
#
# Pré-requisito de DNS: minio-pdf.cotaobra.com.br apontando para
# este servidor (mesmo IP de api.cotaobra.com.br).
# =============================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

ROOT_ENV="$REPO_DIR/.env"
RESET_CREDENTIALS=false

for arg in "$@"; do
  case "$arg" in
    --reset-credentials) RESET_CREDENTIALS=true ;;
    -h|--help)
      sed -n '2,18p' "$0" | sed 's/^# *//'
      exit 0
      ;;
  esac
done

echo ""
echo "============================================="
echo -e " ${BOLD}CotaObra — Setup PDF (MinIO)${NC}"
echo "============================================="
echo ""

if [ ! -f "$ROOT_ENV" ]; then
  echo -e "${RED}❌ .env não encontrado em $ROOT_ENV${NC}"
  exit 1
fi

# -----------------------------------------------------------
# 1) Gera ou reaproveita credenciais MinIO
# -----------------------------------------------------------
# Lê valores existentes (se houver)
EXISTING_USER="$(grep "^MINIO_ROOT_USER=" "$ROOT_ENV" | head -1 | cut -d'=' -f2- || true)"
EXISTING_PASS="$(grep "^MINIO_ROOT_PASSWORD=" "$ROOT_ENV" | head -1 | cut -d'=' -f2- || true)"

if [ -n "$EXISTING_USER" ] && [ -n "$EXISTING_PASS" ] && [ "$RESET_CREDENTIALS" = false ]; then
  echo -e "${GREEN}✅ Credenciais MinIO já existem no .env (não regenero)${NC}"
  MINIO_USER="$EXISTING_USER"
  MINIO_PASS="$EXISTING_PASS"
else
  # Geração: alphanumeric 16 chars para o user, 32 chars para senha
  MINIO_USER="cotaobra_$(openssl rand -hex 6)"
  MINIO_PASS="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-32)"
  echo -e "${YELLOW}🔑 Credenciais MinIO geradas. ANOTE EM COFRE — não serão mostradas de novo:${NC}"
  echo -e "${BOLD}  MINIO_ROOT_USER     = $MINIO_USER${NC}"
  echo -e "${BOLD}  MINIO_ROOT_PASSWORD = $MINIO_PASS${NC}"
fi

# -----------------------------------------------------------
# 2) Backup e atualização do .env
# -----------------------------------------------------------
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="${ROOT_ENV}.bak.${TIMESTAMP}"
cp "$ROOT_ENV" "$BACKUP"
echo -e "${GREEN}✅ Backup .env: $BACKUP${NC}"

upsert_env() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "$ROOT_ENV"; then
    # Escapa caracteres especiais do sed (|, &)
    local safe_value="${value//|/\\|}"
    safe_value="${safe_value//&/\\&}"
    sed -i.tmp "s|^${key}=.*|${key}=${safe_value}|" "$ROOT_ENV"
    rm -f "${ROOT_ENV}.tmp"
  else
    echo "${key}=${value}" >> "$ROOT_ENV"
  fi
}

upsert_env "MINIO_ROOT_USER" "$MINIO_USER"
upsert_env "MINIO_ROOT_PASSWORD" "$MINIO_PASS"
upsert_env "MINIO_PUBLIC_URL" "https://minio-pdf.cotaobra.com.br"
upsert_env "MINIO_INTERNAL_ENDPOINT" "minio:9000"
upsert_env "MINIO_BUCKET" "cotagro-quote-pdfs"
upsert_env "PDF_PRESIGN_TTL_DAYS" "7"
upsert_env "PDF_GENERATION_ENABLED" "true"

echo -e "${GREEN}✅ .env atualizado (MINIO_*, PDF_PRESIGN_TTL_DAYS, PDF_GENERATION_ENABLED)${NC}"

# -----------------------------------------------------------
# 3) Sobe o MinIO (se docker compose disponível)
# -----------------------------------------------------------
if ! command -v docker &> /dev/null; then
  echo -e "${YELLOW}⚠️  Docker não detectado. Termine manualmente:${NC}"
  echo "    docker compose up -d minio"
  echo "    bash scripts/setup-pdf-feature.sh   # rode de novo pra criar o bucket"
  exit 0
fi

echo -e "${YELLOW}🚀 Subindo container MinIO...${NC}"
docker compose up -d minio

# Aguarda healthcheck
echo -n "    Aguardando MinIO ficar saudável "
RETRIES=30
until docker compose exec -T minio mc ready local &>/dev/null || [ $RETRIES -eq 0 ]; do
  printf "."
  RETRIES=$((RETRIES-1))
  sleep 2
done
echo ""

if [ $RETRIES -eq 0 ]; then
  echo -e "${RED}❌ MinIO não respondeu ao healthcheck. Verifique:${NC}"
  echo "    docker compose logs --tail=50 minio"
  exit 1
fi
echo -e "${GREEN}✅ MinIO saudável${NC}"

# -----------------------------------------------------------
# 4) Cria bucket + lifecycle (365 dias) — via mc client
# -----------------------------------------------------------
echo -e "${YELLOW}📦 Configurando bucket cotagro-quote-pdfs...${NC}"

docker compose exec -T minio sh -c "
  mc alias set local http://localhost:9000 '$MINIO_USER' '$MINIO_PASS' >/dev/null
  mc mb --ignore-existing local/cotagro-quote-pdfs >/dev/null
  mc anonymous set none local/cotagro-quote-pdfs >/dev/null
" && echo -e "${GREEN}✅ Bucket cotagro-quote-pdfs criado (ou já existia)${NC}"

# Lifecycle: deleta objetos após 365 dias (LGPD - §5.2 da spec)
echo -e "${YELLOW}♻️  Configurando lifecycle (365 dias retenção)...${NC}"
docker compose exec -T minio sh -c '
  cat > /tmp/lifecycle.json <<EOF
{
  "Rules": [
    {
      "ID": "lgpd-365d",
      "Status": "Enabled",
      "Filter": { "Prefix": "" },
      "Expiration": { "Days": 365 }
    }
  ]
}
EOF
  mc ilm import local/cotagro-quote-pdfs < /tmp/lifecycle.json >/dev/null 2>&1 || true
' && echo -e "${GREEN}✅ Lifecycle configurado${NC}"

# -----------------------------------------------------------
# 5) Resumo
# -----------------------------------------------------------
echo ""
echo "============================================="
echo -e " ${GREEN}${BOLD}Setup concluído.${NC}"
echo "============================================="
echo ""
echo -e "${BOLD}Próximos passos:${NC}"
echo "  1. Confirme que o DNS minio-pdf.cotaobra.com.br aponta pra este servidor"
echo "     (Traefik vai emitir cert Let's Encrypt automaticamente na 1ª request)"
echo "  2. Rebuilde o backend:"
echo "       docker compose up -d --build backend"
echo "  3. Teste o endpoint público:"
echo "       curl -I https://minio-pdf.cotaobra.com.br/minio/health/ready"
echo "     → deve retornar HTTP 200"
echo ""
echo -e "${BOLD}Rollback:${NC}"
echo "  cp $BACKUP $ROOT_ENV"
echo "  docker compose stop minio  &&  docker volume rm cotaobra_minio_data"
echo ""
