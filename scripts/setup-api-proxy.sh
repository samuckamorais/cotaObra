#!/bin/bash
# ================================================================
# CotaObra — Setup API Reverse Proxy (Nginx)
# Configura api.cotaobra.com.br → localhost:3000
# SSL gerenciado pelo Cloudflare (proxy mode)
# ================================================================

set -e

echo "=========================================="
echo "  CotaObra — Setup API Reverse Proxy"
echo "=========================================="

# 1. Criar config Nginx para api.cotaobra.com.br
echo "[1/4] Criando configuração Nginx..."

cat > /etc/nginx/sites-available/api-cotaobra <<'NGINX'
server {
    listen 80;
    server_name api.cotaobra.com.br;

    # Logs
    access_log /var/log/nginx/api-cotaobra-access.log;
    error_log  /var/log/nginx/api-cotaobra-error.log;

    # Proxy para o backend Docker (porta 3000)
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # Headers padrão de proxy
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE (Server-Sent Events) — desabilitar buffering
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;

        # Timeouts adequados para SSE e uploads
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;

        # Tamanho máximo de upload (para imagens/áudio WhatsApp)
        client_max_body_size 20M;
    }
}
NGINX

# 2. Criar config Nginx para cotaobra.com.br (frontend)
echo "[2/4] Criando configuração Nginx para frontend..."

cat > /etc/nginx/sites-available/cotaobra <<'NGINX'
server {
    listen 80;
    server_name cotaobra.com.br www.cotaobra.com.br;

    # Logs
    access_log /var/log/nginx/cotaobra-access.log;
    error_log  /var/log/nginx/cotaobra-error.log;

    # Proxy para o frontend Docker (porta 5173)
    location / {
        proxy_pass http://127.0.0.1:5173;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX

# 3. Ativar sites e remover default
echo "[3/4] Ativando sites..."

# Remover default se existir
rm -f /etc/nginx/sites-enabled/default

# Criar symlinks
ln -sf /etc/nginx/sites-available/api-cotaobra /etc/nginx/sites-enabled/api-cotaobra
ln -sf /etc/nginx/sites-available/cotaobra /etc/nginx/sites-enabled/cotaobra

# Testar configuração
echo "    Testando configuração Nginx..."
nginx -t

# 4. Reiniciar Nginx
echo "[4/4] Reiniciando Nginx..."
systemctl restart nginx
systemctl enable nginx

echo ""
echo "=========================================="
echo "  ✅ Nginx configurado com sucesso!"
echo "=========================================="
echo ""
echo "  api.cotaobra.com.br → localhost:3000 (backend)"
echo "  cotaobra.com.br     → localhost:5173 (frontend)"
echo ""
echo "  IMPORTANTE: No painel Cloudflare, verifique que"
echo "  api.cotaobra.com.br tem o proxy ATIVADO (nuvem laranja)"
echo "  e o SSL mode é 'Flexible' ou 'Full'."
echo ""
echo "  Próximo passo: atualizar VITE_API_URL no .env e"
echo "  rebuildar o frontend:"
echo ""
echo "    cd /home/deploy/cotaObra"
echo "    sed -i 's|VITE_API_URL=.*|VITE_API_URL=https://api.cotaobra.com.br|' .env"
echo "    docker compose build --no-cache frontend"
echo "    docker compose up -d frontend"
echo ""
