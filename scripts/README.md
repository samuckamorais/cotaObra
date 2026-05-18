# Scripts de Deploy e Manutenção - CotaObra

Scripts para facilitar o deploy e manutenção da aplicação na VPS.

## 📋 Scripts Disponíveis

### 1. `vps-install.sh` - Instalação Inicial
Instala todas as dependências necessárias na VPS.

**Uso na VPS:**
```bash
bash scripts/vps-install.sh
```

---

### 2. `vps-deploy.sh` - Deploy Completo ⭐
Script principal de deploy. Execute após fazer push das alterações.

**Uso na VPS:**
```bash
bash scripts/vps-deploy.sh
```

**O que faz:**
1. ✅ Verifica e cria `.env` se não existir
2. ✅ Copia `.env` para `backend/.env`
3. ✅ Detecta IP público e atualiza `WEBHOOK_URL`
4. ✅ Faz `git pull` do repositório
5. ✅ **NOVO:** Valida Tailwind CSS v3 (força downgrade se necessário)
6. ✅ Build e inicia containers Docker
7. ✅ Executa migrations do Prisma
8. ✅ Gera Prisma Client atualizado
9. ✅ Executa seed (cria usuário Admin)
10. ✅ **NOVO:** Valida tabelas críticas (User, Producer, Supplier, Quote, Proposal, Subscription)
11. ✅ **NOVO:** Verifica módulos do backend (auth, quotes, subscriptions, etc)
12. ✅ Reinicia backend
13. ✅ Faz health check

**Credenciais criadas:**
- Email: `admin@cotaobra.com`
- Senha: `Farmflow0147*`

**Funcionalidades disponíveis:**
- ✅ Dashboard com KPIs
- ✅ Gestão de Cotações
- ✅ Gestão de Produtores
- ✅ Gestão de Fornecedores
- ✅ Gestão de Usuários (permissões)
- ✅ **NOVO:** Gestão de Assinaturas (planos BASIC, PRO, ENTERPRISE)
- ✅ Design System Clean Minimal Utility

---

### 3. `vps-validate.sh` - Validação Pós-Deploy ✅ **NOVO**
Valida se todos os serviços estão funcionando após deploy.

**Uso na VPS:**
```bash
bash scripts/vps-validate.sh
```

**O que valida:**
1. ✅ Containers rodando (postgres, redis, backend, frontend)
2. ✅ Conectividade (PostgreSQL, Redis)
3. ✅ Backend health endpoint
4. ✅ Todas as tabelas críticas existem
5. ✅ Usuário Admin foi criado
6. ✅ Frontend responde
7. ✅ Todos os módulos do backend existem
8. ✅ Módulo subscriptions registrado

**Quando usar:**
- ✅ Após deploy para confirmar que tudo funciona
- ✅ Quando houver suspeita de problemas
- ✅ Antes de liberar para produção

---

### 4. `vps-fix-db.sh` - Correção Rápida 🔧
Para corrigir problemas de login ou banco de dados.

**Uso na VPS:**
```bash
bash scripts/vps-fix-db.sh
```

**Use quando:**
- ❌ Não consegue fazer login
- ❌ Erro "User not found"
- ❌ Prisma Client desatualizado
- ❌ Tabelas ausentes

---

## 🚀 Como Usar

### Primeira Instalação

```bash
# 1. Conectar na VPS
ssh usuario@187.77.255.92

# 2. Clonar repositório
git clone https://github.com/samuckamorais/farmFlow.git
cd farmFlow

# 3. Instalar dependências (opcional)
bash scripts/vps-install.sh

# 4. Deploy
bash scripts/vps-deploy.sh
```

### Atualizações

```bash
# Na VPS, no diretório do projeto
bash scripts/vps-deploy.sh

# Validar se tudo funcionou
bash scripts/vps-validate.sh
```

### Correção de Problemas

```bash
# Corrigir banco de dados
bash scripts/vps-fix-db.sh

# Validar após correção
bash scripts/vps-validate.sh
```

---

## 🔧 Comandos Docker Úteis

```bash
# Ver status
docker compose ps

# Logs
docker compose logs -f
docker compose logs -f backend

# Reiniciar
docker compose restart
docker compose restart backend

# Parar/Iniciar
docker compose down
docker compose up -d
```

---

## 🔐 Credenciais Padrão

- **Email:** admin@cotaobra.com
- **Senha:** Farmflow0147*

---

## 🌐 URLs (substitua SEU_IP)

- Frontend: `http://SEU_IP:5173`
- Backend: `http://SEU_IP:3000`
- Health: `http://SEU_IP:3000/health`

---

## 🐛 Troubleshooting

### Não consigo fazer login
```bash
bash scripts/vps-fix-db.sh
```

### Container não inicia
```bash
docker compose logs backend
docker compose down
docker compose up -d
```

### Banco não responde
```bash
docker compose restart postgres
sleep 10
docker compose exec postgres pg_isready -U postgres
```
