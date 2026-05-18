#!/bin/bash
# =============================================================
# CotaObra — Adiciona swap permanente na VPS
#
# Útil para evitar OOM kill durante builds Docker pesados (tsc,
# webpack, vite) em VPSs com pouca RAM (1-2GB). Idempotente:
# rerodar não duplica nem aumenta o swap.
#
# Uso:
#   sudo bash scripts/vps-add-swap.sh           # cria 2GB (default)
#   sudo bash scripts/vps-add-swap.sh 4         # cria 4GB
#
# O que faz:
#   1. Verifica se já existe swap ativo (sai sem mexer se sim)
#   2. Cria /swapfile com fallocate
#   3. Aplica permissões 600, mkswap, swapon
#   4. Adiciona ao /etc/fstab para persistir após reboot
#   5. Ajusta swappiness para 10 (prefere RAM, usa swap apenas sob pressão)
# =============================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

SIZE_GB="${1:-2}"
SWAPFILE="/swapfile"

if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Este script precisa rodar como root: sudo bash $0${NC}"
  exit 1
fi

echo ""
echo "============================================="
echo " CotaObra — Swap setup (${SIZE_GB}GB)"
echo "============================================="
echo ""

# -----------------------------------------------------------
# 1. Verificar swap atual
# -----------------------------------------------------------
CURRENT_SWAP_KB=$(grep -E '^SwapTotal:' /proc/meminfo | awk '{print $2}')
CURRENT_SWAP_GB=$(awk -v kb="$CURRENT_SWAP_KB" 'BEGIN {printf "%.1f", kb/1024/1024}')

echo -e "${BLUE}Swap atual: ${CURRENT_SWAP_GB}GB${NC}"

if [ "$CURRENT_SWAP_KB" -gt 0 ]; then
  echo -e "${GREEN}✅ Já existe swap ativo. Nada a fazer.${NC}"
  echo ""
  echo "Para alterar o tamanho, rode primeiro:"
  echo "  sudo swapoff $SWAPFILE && sudo rm $SWAPFILE"
  echo "  sudo sed -i.bak '\\|^$SWAPFILE|d' /etc/fstab"
  echo "  sudo bash $0 $SIZE_GB"
  exit 0
fi

# -----------------------------------------------------------
# 2. Espaço em disco
# -----------------------------------------------------------
AVAILABLE_GB=$(df --output=avail / | tail -1 | awk '{printf "%.1f", $1/1024/1024}')
echo -e "${BLUE}Disco livre: ${AVAILABLE_GB}GB${NC}"

REQUIRED_GB=$(awk -v s="$SIZE_GB" 'BEGIN {printf "%.1f", s + 1}')
if (( $(awk -v a="$AVAILABLE_GB" -v r="$REQUIRED_GB" 'BEGIN {print (a<r)}') )); then
  echo -e "${RED}❌ Disco insuficiente. Precisa de ${REQUIRED_GB}GB, tem ${AVAILABLE_GB}GB.${NC}"
  exit 1
fi

# -----------------------------------------------------------
# 3. Criar swapfile
# -----------------------------------------------------------
echo -e "${YELLOW}[1/4] Criando $SWAPFILE de ${SIZE_GB}GB...${NC}"
fallocate -l "${SIZE_GB}G" "$SWAPFILE" 2>/dev/null || \
  dd if=/dev/zero of="$SWAPFILE" bs=1M count=$((SIZE_GB * 1024)) status=progress
echo -e "${GREEN}✅ Swapfile criado${NC}"

# -----------------------------------------------------------
# 4. Permissões + mkswap + swapon
# -----------------------------------------------------------
echo -e "${YELLOW}[2/4] Configurando permissões e ativando...${NC}"
chmod 600 "$SWAPFILE"
mkswap "$SWAPFILE" > /dev/null
swapon "$SWAPFILE"
echo -e "${GREEN}✅ Swap ativo${NC}"

# -----------------------------------------------------------
# 5. Persistir em /etc/fstab
# -----------------------------------------------------------
echo -e "${YELLOW}[3/4] Persistindo em /etc/fstab...${NC}"
if ! grep -qE "^$SWAPFILE\s" /etc/fstab; then
  echo "$SWAPFILE none swap sw 0 0" >> /etc/fstab
  echo -e "${GREEN}✅ Linha adicionada ao /etc/fstab${NC}"
else
  echo -e "${BLUE}    /etc/fstab já contém a entrada${NC}"
fi

# -----------------------------------------------------------
# 6. Swappiness (10 = prefere RAM, usa swap só sob pressão)
# -----------------------------------------------------------
echo -e "${YELLOW}[4/4] Ajustando swappiness=10...${NC}"
sysctl vm.swappiness=10 > /dev/null
if ! grep -qE '^vm\.swappiness' /etc/sysctl.conf; then
  echo "vm.swappiness=10" >> /etc/sysctl.conf
fi
echo -e "${GREEN}✅ Swappiness ajustado${NC}"

echo ""
echo "============================================="
echo -e " ${GREEN}Swap configurado.${NC}"
echo "============================================="
echo ""
free -h
echo ""
