#!/bin/bash

# =============================================================
# CotaObra - Instalação inicial da VPS (Ubuntu 24.04)
# Execute como root ou com sudo: bash vps-install.sh
# =============================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo "============================================="
echo " CotaObra - Instalação da VPS"
echo "============================================="
echo ""

# -----------------------------------------------------------
# 1. Atualizar sistema
# -----------------------------------------------------------
echo -e "${YELLOW}[1/7] Atualizando sistema...${NC}"
apt-get update -q && apt-get upgrade -y -q
echo -e "${GREEN}✅ Sistema atualizado${NC}"

# -----------------------------------------------------------
# 2. Instalar dependências básicas
# -----------------------------------------------------------
echo -e "${YELLOW}[2/7] Instalando dependências...${NC}"
apt-get install -y -q \
  curl \
  git \
  ufw \
  ca-certificates \
  gnupg \
  lsb-release
echo -e "${GREEN}✅ Dependências instaladas${NC}"

# -----------------------------------------------------------
# 3. Instalar Docker
# -----------------------------------------------------------
echo -e "${YELLOW}[3/7] Instalando Docker...${NC}"
if command -v docker &> /dev/null; then
  echo "Docker já instalado: $(docker --version)"
else
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
    https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    tee /etc/apt/sources.list.d/docker.list > /dev/null
  apt-get update -q
  apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable docker
  systemctl start docker
fi
echo -e "${GREEN}✅ Docker instalado: $(docker --version)${NC}"

# -----------------------------------------------------------
# 4. Criar usuário deploy (se não existir)
# -----------------------------------------------------------
echo -e "${YELLOW}[4/7] Configurando usuário deploy...${NC}"
if ! id "deploy" &>/dev/null; then
  useradd -m -s /bin/bash deploy
  usermod -aG docker deploy
  echo -e "${GREEN}✅ Usuário 'deploy' criado e adicionado ao grupo docker${NC}"
else
  usermod -aG docker deploy
  echo "Usuário 'deploy' já existe"
fi

# -----------------------------------------------------------
# 5. Configurar firewall
# -----------------------------------------------------------
echo -e "${YELLOW}[5/7] Configurando firewall (UFW)...${NC}"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp    # Frontend (HTTP)
ufw allow 443/tcp   # HTTPS (futuro)
ufw allow 3000/tcp  # Backend API
ufw --force enable
echo -e "${GREEN}✅ Firewall configurado${NC}"
ufw status

# -----------------------------------------------------------
# 6. Clonar repositório
# -----------------------------------------------------------
echo -e "${YELLOW}[6/7] Clonando repositório...${NC}"
REPO_DIR="/home/deploy/farmFlow"

if [ -d "$REPO_DIR" ]; then
  echo "Repositório já existe em $REPO_DIR"
else
  read -p "URL do repositório Git (ex: https://github.com/user/farmFlow.git): " REPO_URL
  git clone "$REPO_URL" "$REPO_DIR"
  chown -R deploy:deploy "$REPO_DIR"
fi
echo -e "${GREEN}✅ Repositório em $REPO_DIR${NC}"

# -----------------------------------------------------------
# 7. Configurar .env
# -----------------------------------------------------------
echo -e "${YELLOW}[7/7] Configurando variáveis de ambiente...${NC}"
if [ ! -f "$REPO_DIR/.env" ]; then
  cp "$REPO_DIR/.env.example" "$REPO_DIR/.env"
  echo ""
  echo -e "${YELLOW}⚠️  IMPORTANTE: Configure o arquivo .env antes de continuar:${NC}"
  echo "   nano $REPO_DIR/.env"
  echo ""
  echo "   Variáveis obrigatórias:"
  echo "   - JWT_SECRET        (gere com: openssl rand -base64 32)"
  echo "   - TWILIO_ACCOUNT_SID"
  echo "   - TWILIO_AUTH_TOKEN"
  echo "   - OPENAI_API_KEY"
  echo "   - WEBHOOK_URL       (URL pública desta VPS, ex: https://seudominio.com)"
else
  echo ".env já configurado"
fi

echo ""
echo "============================================="
echo -e "${GREEN}✅ Instalação concluída!${NC}"
echo "============================================="
echo ""
echo "Próximos passos:"
echo "  1. Configure o .env: nano $REPO_DIR/.env"
echo "  2. Execute o deploy:  bash $REPO_DIR/scripts/vps-deploy.sh"
echo ""
