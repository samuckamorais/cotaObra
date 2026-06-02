#!/usr/bin/env bash
# =============================================================================
# CotaObra — Setup na VPS Hostinger (ambiente COMPARTILHADO com FarmFlow)
# -----------------------------------------------------------------------------
# Sobe o CotaObra como um projeto Docker Compose ISOLADO (`cotaobra`),
# reaproveitando o Traefik e a Evolution API que já rodam na VPS, SEM tocar
# nos projetos existentes (cotaagro / evolution-api / traefik).
#
# Garantias de não-impacto:
#   • Projeto compose próprio (-p cotaobra): containers/volumes/rede dedicados.
#   • NÃO sobe um segundo Traefik (anexa à rede do Traefik atual).
#   • NÃO publica portas no host → impossível colidir com o FarmFlow.
#   • Postgres/Redis/MinIO próprios, com volumes próprios.
#   • Todos os comandos docker são escopados em `-p cotaobra`.
#
# Uso:
#   bash scripts/vps-setup-cotaobra.sh            # interativo
#   bash scripts/vps-setup-cotaobra.sh --yes      # sem confirmações
#   bash scripts/vps-setup-cotaobra.sh --no-seed  # não roda o seed
#
# Overrides (caso a detecção falhe, exporte antes de rodar):
#   TRAEFIK_NETWORK=... TRAEFIK_CERTRESOLVER=... TRAEFIK_ENTRYPOINT=... \
#   EVOLUTION_API_URL=... bash scripts/vps-setup-cotaobra.sh
# =============================================================================
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${GREEN}✔${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC}  $*"; }
err()  { echo -e "${RED}✖${NC} $*" >&2; }
step() { echo -e "\n${BLUE}▶ $*${NC}"; }

PROJECT="cotaobra"
COMPOSE_FILE="docker-compose.prod.yml"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

AUTO_YES=false
RUN_SEED=true
for arg in "$@"; do
  case "$arg" in
    --yes|-y) AUTO_YES=true ;;
    --no-seed) RUN_SEED=false ;;
  esac
done

confirm() { # confirm "pergunta"
  $AUTO_YES && return 0
  read -r -p "$(echo -e "${YELLOW}? $1 [s/N] ${NC}")" ans
  [[ "$ans" =~ ^[sSyY]$ ]]
}

dc() { docker compose -p "$PROJECT" -f "$COMPOSE_FILE" --env-file .env "$@"; }

echo "============================================================"
echo "  CotaObra — Setup VPS (projeto isolado: $PROJECT)"
echo "  Repo: $REPO_DIR"
echo "============================================================"

# -----------------------------------------------------------------------------
# 0. Pré-requisitos
# -----------------------------------------------------------------------------
step "[0/7] Verificando pré-requisitos"
command -v docker >/dev/null || { err "Docker não encontrado."; exit 1; }
docker compose version >/dev/null 2>&1 || { err "Docker Compose v2 não encontrado."; exit 1; }
command -v openssl >/dev/null || { err "openssl não encontrado (necessário p/ gerar segredos)."; exit 1; }
docker info >/dev/null 2>&1 || { err "Sem acesso ao daemon Docker (rode com sudo ou no usuário certo)."; exit 1; }
log "Docker + Compose + openssl OK"

# -----------------------------------------------------------------------------
# 1. Detecção do ambiente existente (Traefik / Evolution) — só LEITURA
# -----------------------------------------------------------------------------
step "[1/7] Detectando Traefik e Evolution já em execução (somente leitura)"

# --- Traefik container + rede ---
TRAEFIK_CT="$(docker ps --format '{{.Names}}' | grep -iE 'traefik' | head -1 || true)"
if [[ -z "${TRAEFIK_NETWORK:-}" ]]; then
  if [[ -n "$TRAEFIK_CT" ]]; then
    TRAEFIK_NETWORK="$(docker inspect "$TRAEFIK_CT" \
      -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}' \
      | grep -vE '^(bridge|host|none)$' | head -1 || true)"
  fi
fi

# --- Certresolver + entrypoint: ler dos labels de algum serviço já publicado ---
detect_label() { # detect_label <regex-do-valor> ; varre labels de todos os containers
  docker ps -q | while read -r id; do
    docker inspect "$id" -f '{{range $k,$v := .Config.Labels}}{{$k}}={{$v}}{{"\n"}}{{end}}' 2>/dev/null
  done | grep -iE "$1" | head -1 || true
}
if [[ -z "${TRAEFIK_CERTRESOLVER:-}" ]]; then
  CR_LINE="$(detect_label 'tls\.certresolver=')"
  TRAEFIK_CERTRESOLVER="${CR_LINE##*=}"
  [[ -z "$TRAEFIK_CERTRESOLVER" ]] && TRAEFIK_CERTRESOLVER="letsencrypt"
fi
if [[ -z "${TRAEFIK_ENTRYPOINT:-}" ]]; then
  EP_LINE="$(detect_label 'routers\..*\.entrypoints=')"
  EP_VAL="${EP_LINE##*=}"
  TRAEFIK_ENTRYPOINT="${EP_VAL:-websecure}"
fi

# --- Evolution container (para a instância dedicada do CotaObra) ---
EVO_CT="$(docker ps --format '{{.Names}}' | grep -iE 'evolution' | head -1 || true)"
if [[ -z "${EVOLUTION_API_URL:-}" && -n "$EVO_CT" ]]; then
  # A Evolution precisa estar na MESMA rede do Traefik p/ o backend alcançá-la.
  if docker inspect "$EVO_CT" -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' \
       | grep -qw "${TRAEFIK_NETWORK:-__none__}"; then
    EVOLUTION_API_URL="http://${EVO_CT}:8080"
  else
    warn "Evolution ($EVO_CT) não está na rede do Traefik; o backend será conectado a ela após subir."
    EVO_NET="$(docker inspect "$EVO_CT" -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}' | grep -vE '^(bridge|host|none)$' | head -1 || true)"
    EVOLUTION_API_URL="http://${EVO_CT}:8080"
  fi
fi

echo "   Traefik container : ${TRAEFIK_CT:-<não encontrado>}"
echo "   Traefik network   : ${TRAEFIK_NETWORK:-<NÃO DETECTADO>}"
echo "   Certresolver      : ${TRAEFIK_CERTRESOLVER}"
echo "   Entrypoint HTTPS  : ${TRAEFIK_ENTRYPOINT}"
echo "   Evolution container: ${EVO_CT:-<não encontrado>}"
echo "   Evolution URL     : ${EVOLUTION_API_URL:-<configurar manualmente>}"

if [[ -z "${TRAEFIK_NETWORK:-}" ]]; then
  err "Não detectei a rede do Traefik. Exporte TRAEFIK_NETWORK=<nome> e rode de novo."
  echo "    Dica: docker network ls   (procure a rede onde traefik/cotaagro estão)"
  exit 1
fi
docker network inspect "$TRAEFIK_NETWORK" >/dev/null 2>&1 \
  || { err "Rede '$TRAEFIK_NETWORK' não existe."; exit 1; }

confirm "Os valores detectados acima estão corretos?" || {
  warn "Edite os overrides e rode novamente. Abortado."
  exit 0
}

# -----------------------------------------------------------------------------
# 2. Montagem do .env (idempotente — só preenche o que está em branco)
# -----------------------------------------------------------------------------
step "[2/7] Preparando .env"
[[ -f .env ]] || { cp .env.prod.example .env; log ".env criado a partir do exemplo"; }
sed -i 's/\r$//' .env  # normaliza CRLF (edição no Windows)

# upsert KEY=VALUE no .env
set_env() { local k="$1" v="$2"
  if grep -qE "^${k}=" .env; then
    sed -i "s|^${k}=.*|${k}=${v}|" .env
  else
    echo "${k}=${v}" >> .env
  fi
}
# preenche só se estiver vazio/placeholder
set_if_blank() { local k="$1" v="$2"
  local cur; cur="$(grep -E "^${k}=" .env | head -1 | cut -d= -f2- || true)"
  if [[ -z "$cur" ]]; then set_env "$k" "$v"; fi
}
gen() { openssl rand -hex "${1:-32}"; }

# Infra detectada
set_env TRAEFIK_NETWORK     "$TRAEFIK_NETWORK"
set_env TRAEFIK_CERTRESOLVER "$TRAEFIK_CERTRESOLVER"
set_env TRAEFIK_ENTRYPOINT  "$TRAEFIK_ENTRYPOINT"
[[ -n "${EVOLUTION_API_URL:-}" ]] && set_if_blank EVOLUTION_API_URL "$EVOLUTION_API_URL"

# Segredos gerados (não sobrescreve se já existir → re-rodar é seguro)
set_if_blank POSTGRES_PASSWORD       "$(gen 24)"
set_if_blank MINIO_ROOT_PASSWORD     "$(gen 20)"
set_if_blank JWT_SECRET              "$(gen 32)"
set_if_blank JWT_REFRESH_SECRET      "$(gen 32)"
set_if_blank ENCRYPTION_KEY          "$(gen 32)"
set_if_blank EVOLUTION_WEBHOOK_SECRET "$(gen 16)"

# Domínios + URLs derivadas (default app.cotaobra.com.br já vem no exemplo)
APP_DOMAIN="$(grep -E '^APP_DOMAIN=' .env | head -1 | cut -d= -f2-)"
STORAGE_DOMAIN="$(grep -E '^STORAGE_DOMAIN=' .env | head -1 | cut -d= -f2-)"
set_env ALLOWED_ORIGINS "https://${APP_DOMAIN}"
set_env FRONTEND_URL    "https://${APP_DOMAIN}"
set_env WEBHOOK_URL     "https://${APP_DOMAIN}"
set_env GIT_SHA         "$(git rev-parse --short HEAD 2>/dev/null || echo dev)"

log ".env preparado (segredos gerados onde faltava)"

# Avisos de variáveis externas que dependem do cliente
[[ -z "$(grep -E '^EVOLUTION_API_KEY=' .env | cut -d= -f2-)" ]] && \
  warn "EVOLUTION_API_KEY vazio → cole a AUTHENTICATION_API_KEY da Evolution existente em .env"
[[ -z "$(grep -E '^OPENAI_API_KEY=' .env | cut -d= -f2-)" ]] && \
  warn "OPENAI_API_KEY vazio → NLU/transcrição de áudio ficarão em modo fallback"
[[ -z "$(grep -E '^ASAAS_API_KEY=' .env | cut -d= -f2-)" ]] && \
  warn "ASAAS_API_KEY vazio → billing roda em modo stub (sem cobrança real)"

# -----------------------------------------------------------------------------
# 3. Guarda anti-colisão (não pisar no FarmFlow)
# -----------------------------------------------------------------------------
step "[3/7] Checando colisões com projetos existentes"
for name in cotaobra-postgres cotaobra-redis cotaobra-minio cotaobra-backend cotaobra-frontend; do
  existing_proj="$(docker inspect "$name" -f '{{ index .Config.Labels "com.docker.compose.project" }}' 2>/dev/null || true)"
  if [[ -n "$existing_proj" && "$existing_proj" != "$PROJECT" ]]; then
    err "Container '$name' já existe no projeto '$existing_proj' (não é o cotaobra). Abortando p/ não impactar."
    exit 1
  fi
done
log "Nenhuma colisão de container. FarmFlow/Evolution/Traefik intactos."

# -----------------------------------------------------------------------------
# 4. Build + up (escopado em -p cotaobra)
# -----------------------------------------------------------------------------
step "[4/7] Build e subida dos containers do CotaObra"
dc up -d --build
log "Containers do projeto '$PROJECT' iniciados"

# Conecta o backend à rede da Evolution, se ela estiver fora da rede do Traefik
if [[ -n "${EVO_CT:-}" && -n "${EVO_NET:-}" ]]; then
  if ! docker inspect cotaobra-backend -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' | grep -qw "$EVO_NET"; then
    docker network connect "$EVO_NET" cotaobra-backend 2>/dev/null \
      && log "backend conectado à rede da Evolution ($EVO_NET)" \
      || warn "Não consegui conectar backend à rede da Evolution; ajuste EVOLUTION_API_URL manualmente."
  fi
fi

# -----------------------------------------------------------------------------
# 5. Banco: aguardar, migrar, (seed)
# -----------------------------------------------------------------------------
step "[5/7] Aguardando Postgres e aplicando migrations"
RETRIES=20
until dc exec -T postgres pg_isready -U cotaobra -d cotaobra >/dev/null 2>&1 || [[ $RETRIES -eq 0 ]]; do
  echo "   ...aguardando Postgres ($RETRIES)"; RETRIES=$((RETRIES-1)); sleep 3
done
[[ $RETRIES -eq 0 ]] && { err "Postgres não respondeu. Veja: docker compose -p $PROJECT logs postgres"; exit 1; }
log "Postgres pronto"

echo "   → prisma migrate deploy"
dc exec -T backend npx prisma migrate deploy
log "Migrations aplicadas"

if $RUN_SEED; then
  TENANTS="$(dc exec -T postgres psql -U cotaobra -d cotaobra -tAc 'SELECT COUNT(*) FROM tenants;' 2>/dev/null | tr -d ' \r' || echo 0)"
  if [[ "$TENANTS" == "0" ]]; then
    echo "   → seed inicial (tenant demo + catálogo)"
    dc exec -T backend npm run prisma:seed && log "Seed executado" || warn "Seed falhou (verifique logs do backend)"
  else
    log "Banco já tem $TENANTS tenant(s) — seed ignorado"
  fi
fi

# -----------------------------------------------------------------------------
# 6. Health check (interno — sem depender de DNS ainda)
# -----------------------------------------------------------------------------
step "[6/7] Health check do backend"
sleep 4
if dc exec -T backend wget -qO- http://localhost:3000/health >/dev/null 2>&1; then
  log "Backend respondendo em /health"
else
  warn "Backend ainda não respondeu /health. Veja: docker compose -p $PROJECT logs backend"
fi

# -----------------------------------------------------------------------------
# 7. Resumo
# -----------------------------------------------------------------------------
step "[7/7] Status"
dc ps

PUBLIC_IP="$(curl -4 -s --max-time 5 ifconfig.me 2>/dev/null || echo '<IP-da-VPS>')"
echo ""
echo "============================================================"
echo -e "${GREEN}  CotaObra no ar (projeto isolado: $PROJECT)${NC}"
echo "============================================================"
echo ""
echo "1) DNS — aponte estes registros A para a VPS ($PUBLIC_IP):"
echo "     ${APP_DOMAIN}      A   ${PUBLIC_IP}"
echo "     ${STORAGE_DOMAIN}  A   ${PUBLIC_IP}"
echo "   (o Traefik existente emite o TLS automaticamente após o DNS propagar)"
echo ""
echo "2) Acesso após DNS + TLS:"
echo "     Painel : https://${APP_DOMAIN}"
echo "     Storage: https://${STORAGE_DOMAIN}"
echo ""
echo "3) Login demo (troque a senha depois!):"
echo "     admin@cotaobra.dev / senha-dev-123   (Construtora Aurora)"
echo ""
echo "4) WhatsApp: confirme EVOLUTION_API_KEY no .env e crie a instância"
echo "     '${EVOLUTION_INSTANCE_NAME:-cotaobra}' apontando o webhook para:"
echo "     https://${APP_DOMAIN}/api/whatsapp/webhook"
echo ""
echo "Comandos (sempre escopados em -p $PROJECT — não afetam o FarmFlow):"
echo "   Logs:        docker compose -p $PROJECT -f $COMPOSE_FILE logs -f backend"
echo "   Status:      docker compose -p $PROJECT -f $COMPOSE_FILE ps"
echo "   Reiniciar:   docker compose -p $PROJECT -f $COMPOSE_FILE restart backend"
echo "   Atualizar:   git pull && bash scripts/vps-setup-cotaobra.sh --yes"
echo "   Parar TUDO:  docker compose -p $PROJECT -f $COMPOSE_FILE down   (FarmFlow segue rodando)"
echo ""
