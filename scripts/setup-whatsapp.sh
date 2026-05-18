#!/bin/bash

# ============================================================================
# CotaObra - WhatsApp Configuration Setup Script
# ============================================================================
# Este script facilita a configuração do WhatsApp para o sistema CotaObra
# Suporta dois providers: Twilio e Evolution API
# ============================================================================

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Diretório do script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")/backend"
ENV_FILE="$BACKEND_DIR/.env"

# ============================================================================
# Funções Auxiliares
# ============================================================================

print_header() {
    echo ""
    echo -e "${BLUE}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}${BOLD}  $1${NC}"
    echo -e "${BLUE}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

prompt_input() {
    local prompt="$1"
    local default="$2"
    local result

    if [ -n "$default" ]; then
        read -p "$(echo -e ${BOLD}$prompt${NC} [${YELLOW}$default${NC}]): )" result
        echo "${result:-$default}"
    else
        read -p "$(echo -e ${BOLD}$prompt${NC}: )" result
        echo "$result"
    fi
}

prompt_secret() {
    local prompt="$1"
    local result
    read -sp "$(echo -e ${BOLD}$prompt${NC}: )" result
    echo ""
    echo "$result"
}

prompt_confirm() {
    local prompt="$1"
    local response
    read -p "$(echo -e ${BOLD}$prompt${NC} [y/N]: )" response
    [[ "$response" =~ ^[Yy]$ ]]
}

update_env_var() {
    local key="$1"
    local value="$2"

    if grep -q "^${key}=" "$ENV_FILE"; then
        # Substituir valor existente (compatível com macOS e Linux)
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
        else
            sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
        fi
        print_success "Atualizado: $key"
    else
        # Adicionar nova variável
        echo "${key}=${value}" >> "$ENV_FILE"
        print_success "Adicionado: $key"
    fi
}

check_command() {
    if ! command -v $1 &> /dev/null; then
        print_error "$1 não está instalado"
        return 1
    fi
    return 0
}

# ============================================================================
# Funções de Configuração
# ============================================================================

setup_twilio() {
    print_header "Configuração Twilio WhatsApp Business API"

    echo "Para usar o Twilio, você precisa:"
    echo "  1. Conta no Twilio (https://www.twilio.com/)"
    echo "  2. WhatsApp Business API configurado"
    echo "  3. Número WhatsApp aprovado"
    echo ""

    if ! prompt_confirm "Você já tem uma conta Twilio configurada?"; then
        print_info "Acesse https://www.twilio.com/try-twilio para criar uma conta"
        print_info "Depois volte aqui para continuar a configuração"
        return 1
    fi

    echo ""
    print_info "Encontre suas credenciais em: https://console.twilio.com/"
    echo ""

    TWILIO_ACCOUNT_SID=$(prompt_input "Account SID")
    TWILIO_AUTH_TOKEN=$(prompt_secret "Auth Token")
    TWILIO_WHATSAPP_NUMBER=$(prompt_input "Número WhatsApp Twilio (ex: +14155238886)")

    if [ -z "$TWILIO_ACCOUNT_SID" ] || [ -z "$TWILIO_AUTH_TOKEN" ] || [ -z "$TWILIO_WHATSAPP_NUMBER" ]; then
        print_error "Todas as credenciais são obrigatórias"
        return 1
    fi

    # Atualizar .env
    update_env_var "WHATSAPP_PROVIDER" "twilio"
    update_env_var "TWILIO_ACCOUNT_SID" "$TWILIO_ACCOUNT_SID"
    update_env_var "TWILIO_AUTH_TOKEN" "$TWILIO_AUTH_TOKEN"
    update_env_var "TWILIO_WHATSAPP_NUMBER" "$TWILIO_WHATSAPP_NUMBER"

    echo ""
    print_success "Twilio configurado com sucesso!"

    # Configurar webhook
    setup_twilio_webhook

    return 0
}

setup_twilio_webhook() {
    echo ""
    print_header "Configuração de Webhook - Twilio"

    print_info "O Twilio precisa de uma URL pública para enviar mensagens recebidas"
    echo ""

    WEBHOOK_URL=$(prompt_input "URL do webhook (ex: https://api.cotaobra.com.br)" "")

    if [ -z "$WEBHOOK_URL" ]; then
        print_warning "Webhook não configurado. Configure depois em .env"
        return
    fi

    WEBHOOK_FULL_URL="${WEBHOOK_URL}/api/webhook/whatsapp"
    update_env_var "WEBHOOK_URL" "$WEBHOOK_URL"

    echo ""
    print_success "Webhook URL configurada: $WEBHOOK_FULL_URL"
    echo ""
    print_info "Configure no Twilio Console:"
    echo "  1. Acesse: https://console.twilio.com/us1/develop/sms/settings/whatsapp-sandbox"
    echo "  2. Em 'When a message comes in', cole:"
    echo "     ${BOLD}$WEBHOOK_FULL_URL${NC}"
    echo "  3. Método: POST"
    echo ""
}

setup_evolution() {
    print_header "Configuração Evolution API (Open Source)"

    echo "Evolution API é uma solução open source para WhatsApp"
    echo "GitHub: https://github.com/EvolutionAPI/evolution-api"
    echo ""

    if ! prompt_confirm "Você já tem a Evolution API rodando?"; then
        print_info "Para instalar a Evolution API:"
        echo ""
        echo "  Opção 1 - Docker Compose (Recomendado):"
        echo "    git clone https://github.com/EvolutionAPI/evolution-api"
        echo "    cd evolution-api"
        echo "    docker-compose up -d"
        echo ""
        echo "  Opção 2 - Docker simples:"
        echo "    docker run -d --name evolution-api -p 8080:8080 atendai/evolution-api"
        echo ""
        echo "  Opção 3 - NPM:"
        echo "    npm i -g @evolution/api"
        echo "    evolution-api"
        echo ""
        print_info "Depois de instalar, volte aqui para continuar"
        return 1
    fi

    echo ""
    EVOLUTION_API_URL=$(prompt_input "URL da Evolution API" "http://localhost:8080")
    EVOLUTION_API_KEY=$(prompt_input "API Key da Evolution" "")
    EVOLUTION_INSTANCE_NAME=$(prompt_input "Nome da instância" "cotaobra")

    if [ -z "$EVOLUTION_API_KEY" ]; then
        print_warning "API Key vazia. A Evolution API pode exigir autenticação"
    fi

    # Atualizar .env
    update_env_var "WHATSAPP_PROVIDER" "evolution"
    update_env_var "EVOLUTION_API_URL" "$EVOLUTION_API_URL"
    update_env_var "EVOLUTION_API_KEY" "$EVOLUTION_API_KEY"
    update_env_var "EVOLUTION_INSTANCE_NAME" "$EVOLUTION_INSTANCE_NAME"

    echo ""
    print_success "Evolution API configurada!"

    # Testar conexão
    if prompt_confirm "Deseja testar a conexão agora?"; then
        test_evolution_connection "$EVOLUTION_API_URL" "$EVOLUTION_API_KEY" "$EVOLUTION_INSTANCE_NAME"
    fi

    # Configurar webhook
    setup_evolution_webhook "$EVOLUTION_API_URL" "$EVOLUTION_API_KEY" "$EVOLUTION_INSTANCE_NAME"

    return 0
}

test_evolution_connection() {
    local api_url="$1"
    local api_key="$2"
    local instance="$3"

    echo ""
    print_info "Testando conexão com Evolution API..."

    # Testar se a API está respondendo
    if curl -s -f -H "apikey: $api_key" "${api_url}/instance/connectionState/${instance}" > /dev/null 2>&1; then
        print_success "Evolution API está respondendo!"

        # Verificar estado da instância
        STATE=$(curl -s -H "apikey: $api_key" "${api_url}/instance/connectionState/${instance}" | grep -o '"state":"[^"]*"' | cut -d'"' -f4)

        if [ "$STATE" = "open" ]; then
            print_success "Instância conectada ao WhatsApp!"
        else
            print_warning "Instância não está conectada (estado: $STATE)"
            print_info "Use o QR Code para conectar: ${api_url}/instance/connect/${instance}"
        fi
    else
        print_error "Não foi possível conectar à Evolution API"
        print_info "Verifique se a API está rodando em: $api_url"
    fi
}

setup_evolution_webhook() {
    local api_url="$1"
    local api_key="$2"
    local instance="$3"

    echo ""
    print_header "Configuração de Webhook - Evolution API"

    WEBHOOK_URL=$(prompt_input "URL do webhook (ex: https://api.cotaobra.com.br)" "")

    if [ -z "$WEBHOOK_URL" ]; then
        print_warning "Webhook não configurado"
        return
    fi

    WEBHOOK_FULL_URL="${WEBHOOK_URL}/api/webhook/whatsapp"
    update_env_var "WEBHOOK_URL" "$WEBHOOK_URL"

    if prompt_confirm "Deseja configurar o webhook automaticamente via API?"; then
        echo ""
        print_info "Configurando webhook..."

        RESPONSE=$(curl -s -X POST \
            -H "Content-Type: application/json" \
            -H "apikey: $api_key" \
            -d "{\"url\": \"$WEBHOOK_FULL_URL\", \"webhook_by_events\": false, \"events\": [\"MESSAGES_UPSERT\"]}" \
            "${api_url}/webhook/set/${instance}")

        if echo "$RESPONSE" | grep -q "success"; then
            print_success "Webhook configurado automaticamente!"
        else
            print_warning "Não foi possível configurar automaticamente"
            print_info "Configure manualmente acessando: ${api_url}/manager"
        fi
    else
        print_info "Configure manualmente o webhook:"
        echo "  URL: ${BOLD}$WEBHOOK_FULL_URL${NC}"
        echo "  Evento: MESSAGES_UPSERT"
    fi
}

setup_ngrok() {
    print_header "Configuração de Túnel Local (ngrok)"

    echo "Para desenvolvimento local, você precisa de uma URL pública"
    echo "O ngrok cria um túnel seguro da internet para sua máquina local"
    echo ""

    if ! check_command ngrok; then
        print_info "Instale o ngrok:"
        echo "  macOS: brew install ngrok"
        echo "  Linux: snap install ngrok"
        echo "  Ou: https://ngrok.com/download"
        echo ""
        return 1
    fi

    print_success "ngrok está instalado!"
    echo ""

    if prompt_confirm "Deseja iniciar o ngrok agora?"; then
        PORT=$(grep "^PORT=" "$ENV_FILE" | cut -d'=' -f2)
        PORT=${PORT:-3000}

        echo ""
        print_info "Iniciando ngrok na porta $PORT..."
        print_info "Pressione Ctrl+C para parar o ngrok"
        echo ""

        # Iniciar ngrok em background e capturar URL
        ngrok http $PORT --log=stdout > /tmp/ngrok.log 2>&1 &
        NGROK_PID=$!

        # Aguardar ngrok iniciar
        sleep 3

        # Obter URL pública
        NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"https://[^"]*"' | head -1 | cut -d'"' -f4)

        if [ -n "$NGROK_URL" ]; then
            print_success "ngrok iniciado com sucesso!"
            echo ""
            echo "  URL pública: ${BOLD}${GREEN}$NGROK_URL${NC}"
            echo "  Dashboard: http://localhost:4040"
            echo ""

            if prompt_confirm "Deseja atualizar WEBHOOK_URL no .env?"; then
                update_env_var "WEBHOOK_URL" "$NGROK_URL"
                print_success "WEBHOOK_URL atualizado!"
                echo ""
                print_warning "Lembre-se de configurar este webhook no seu provider:"
                echo "  ${BOLD}${NGROK_URL}/api/webhook/whatsapp${NC}"
            fi
        else
            print_error "Não foi possível obter URL do ngrok"
            kill $NGROK_PID 2>/dev/null
        fi
    fi
}

setup_openai() {
    print_header "Configuração OpenAI API"

    echo "CotaObra usa GPT-4 para:"
    echo "  • Interpretação de mensagens (NLU)"
    echo "  • Transcrição de áudio (Whisper)"
    echo "  • Análise de fotos (Vision)"
    echo "  • Sugestões inteligentes"
    echo ""

    CURRENT_KEY=$(grep "^OPENAI_API_KEY=" "$ENV_FILE" | cut -d'=' -f2)

    if [ -n "$CURRENT_KEY" ] && [ "$CURRENT_KEY" != "sk-proj-seu_api_key_aqui" ]; then
        print_info "OpenAI API já configurada (${CURRENT_KEY:0:20}...)"
        if ! prompt_confirm "Deseja alterar?"; then
            return 0
        fi
    fi

    echo ""
    print_info "Obtenha sua API key em: https://platform.openai.com/api-keys"
    echo ""

    OPENAI_API_KEY=$(prompt_secret "OpenAI API Key")

    if [ -z "$OPENAI_API_KEY" ]; then
        print_warning "OpenAI não configurado. Sistema funcionará em modo limitado"
        return 1
    fi

    update_env_var "OPENAI_API_KEY" "$OPENAI_API_KEY"

    OPENAI_MODEL=$(prompt_input "Modelo GPT" "gpt-4o")
    update_env_var "OPENAI_MODEL" "$OPENAI_MODEL"

    print_success "OpenAI configurada!"

    return 0
}

verify_setup() {
    print_header "Verificação da Configuração"

    echo "Verificando configuração do WhatsApp..."
    echo ""

    PROVIDER=$(grep "^WHATSAPP_PROVIDER=" "$ENV_FILE" | cut -d'=' -f2)

    if [ "$PROVIDER" = "twilio" ]; then
        print_info "Provider: Twilio"

        ACCOUNT_SID=$(grep "^TWILIO_ACCOUNT_SID=" "$ENV_FILE" | cut -d'=' -f2)
        AUTH_TOKEN=$(grep "^TWILIO_AUTH_TOKEN=" "$ENV_FILE" | cut -d'=' -f2)
        PHONE=$(grep "^TWILIO_WHATSAPP_NUMBER=" "$ENV_FILE" | cut -d'=' -f2)

        [ -n "$ACCOUNT_SID" ] && print_success "Account SID configurado" || print_error "Account SID faltando"
        [ -n "$AUTH_TOKEN" ] && print_success "Auth Token configurado" || print_error "Auth Token faltando"
        [ -n "$PHONE" ] && print_success "Número WhatsApp: $PHONE" || print_error "Número faltando"

    elif [ "$PROVIDER" = "evolution" ]; then
        print_info "Provider: Evolution API"

        API_URL=$(grep "^EVOLUTION_API_URL=" "$ENV_FILE" | cut -d'=' -f2)
        API_KEY=$(grep "^EVOLUTION_API_KEY=" "$ENV_FILE" | cut -d'=' -f2)
        INSTANCE=$(grep "^EVOLUTION_INSTANCE_NAME=" "$ENV_FILE" | cut -d'=' -f2)

        [ -n "$API_URL" ] && print_success "API URL: $API_URL" || print_error "API URL faltando"
        [ -n "$API_KEY" ] && print_success "API Key configurada" || print_warning "API Key vazia"
        [ -n "$INSTANCE" ] && print_success "Instância: $INSTANCE" || print_error "Nome da instância faltando"

    else
        print_error "Provider não configurado"
    fi

    echo ""
    WEBHOOK=$(grep "^WEBHOOK_URL=" "$ENV_FILE" | cut -d'=' -f2)
    [ -n "$WEBHOOK" ] && print_success "Webhook: $WEBHOOK/api/webhook/whatsapp" || print_warning "Webhook não configurado"

    echo ""
    OPENAI=$(grep "^OPENAI_API_KEY=" "$ENV_FILE" | cut -d'=' -f2)
    [ -n "$OPENAI" ] && [ "$OPENAI" != "sk-proj-seu_api_key_aqui" ] && print_success "OpenAI configurada" || print_warning "OpenAI não configurada"
}

# ============================================================================
# Menu Principal
# ============================================================================

show_menu() {
    clear
    echo ""
    echo -e "${BLUE}${BOLD}"
    echo "   ██████╗ ██████╗ ████████╗ █████╗  █████╗  ██████╗ ██████╗  ██████╗ "
    echo "  ██╔════╝██╔═══██╗╚══██╔══╝██╔══██╗██╔══██╗██╔════╝ ██╔══██╗██╔═══██╗"
    echo "  ██║     ██║   ██║   ██║   ███████║███████║██║  ███╗██████╔╝██║   ██║"
    echo "  ██║     ██║   ██║   ██║   ██╔══██║██╔══██║██║   ██║██╔══██╗██║   ██║"
    echo "  ╚██████╗╚██████╔╝   ██║   ██║  ██║██║  ██║╚██████╔╝██║  ██║╚██████╔╝"
    echo "   ╚═════╝ ╚═════╝    ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ "
    echo -e "${NC}"
    echo -e "${BOLD}  Configuração de WhatsApp${NC}"
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "  1) Configurar Twilio WhatsApp Business API"
    echo "  2) Configurar Evolution API (Open Source)"
    echo "  3) Configurar OpenAI (GPT-4, Whisper, Vision)"
    echo "  4) Configurar túnel local (ngrok)"
    echo "  5) Verificar configuração atual"
    echo ""
    echo "  0) Sair"
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

# ============================================================================
# Main
# ============================================================================

main() {
    # Verificar se .env existe
    if [ ! -f "$ENV_FILE" ]; then
        print_warning "Arquivo .env não encontrado"
        if prompt_confirm "Deseja criar a partir do .env.example?"; then
            cp "$BACKEND_DIR/.env.example" "$ENV_FILE"
            print_success ".env criado!"
        else
            print_error "Não é possível continuar sem .env"
            exit 1
        fi
    fi

    while true; do
        show_menu
        read -p "Escolha uma opção: " choice

        case $choice in
            1)
                setup_twilio
                read -p "Pressione Enter para continuar..."
                ;;
            2)
                setup_evolution
                read -p "Pressione Enter para continuar..."
                ;;
            3)
                setup_openai
                read -p "Pressione Enter para continuar..."
                ;;
            4)
                setup_ngrok
                read -p "Pressione Enter para continuar..."
                ;;
            5)
                verify_setup
                read -p "Pressione Enter para continuar..."
                ;;
            0)
                echo ""
                print_success "Configuração concluída!"
                echo ""
                print_info "Próximos passos:"
                echo "  1. Inicie o backend: cd backend && npm run dev"
                echo "  2. Teste enviando uma mensagem WhatsApp"
                echo "  3. Monitore logs para verificar recebimento"
                echo ""
                exit 0
                ;;
            *)
                print_error "Opção inválida"
                sleep 2
                ;;
        esac
    done
}

# Executar
main
