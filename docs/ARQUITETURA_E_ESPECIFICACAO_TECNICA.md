# CotaObra

**Plataforma de Cotação de Materiais de Construção via WhatsApp + Web**

Documento de Arquitetura e Especificação Técnica — versão 1.0
Autor: BO Sênior (Claude)
Data: 18 de maio de 2026
Status: Pré-MVP / Blueprint para implementação

---

## 1. Visão geral do produto

O CotaObra é uma plataforma SaaS B2B que automatiza o processo de cotação de **materiais de construção** para construtoras e incorporadoras de médio porte. O sistema conecta o ciclo solicitação → cotação → proposta → fechamento em um fluxo único, usando **WhatsApp** como canal principal de campo (engenheiro de obra e fornecedor) e um **painel web** como cockpit para o setor de Compras/Suprimentos.

O produto resolve o problema central do segmento: o comprador de uma construtora gasta entre 5 e 12 horas por semana fazendo cotações manuais com 4 a 12 fornecedores por item, em planilhas paralelas, perdendo histórico, sem comparabilidade e sem rastreio de quem respondeu o quê. O CotaObra automatiza esse ciclo, padroniza o dado, dispara em paralelo para os fornecedores certos e devolve um quadro comparativo pronto para decisão — com o menor preço, prazo, condição e frete já consolidados.

### 1.1 Diferenciais frente ao processo atual

- Solicitação a partir da obra via WhatsApp (engenheiro/encarregado dispara a demanda sem entrar no sistema).
- Disparo paralelo para múltiplos fornecedores, com preenchimento via WhatsApp (item único) ou formulário web (multi-item).
- Quadro comparativo consolidado, com ranking por menor preço corrigido (preço × frete × prazo × pagamento).
- Aprovação hierárquica configurável (engenheiro → comprador → diretor) para compras acima de tetos.
- Histórico de preços por insumo, fornecedor, obra e região — base para BI e previsão.

### 1.2 Personas

- **Engenheiro de obra / encarregado**: solicita material via WhatsApp ou app. Está no canteiro, no celular, com pressa.
- **Comprador / setor de Suprimentos**: opera o painel web. Revisa solicitação, escolhe fornecedores, dispara cotação, avalia propostas, fecha pedido.
- **Diretor / coordenador de compras**: aprova compras acima do teto (configurável), vê dashboard de economia e SLA.
- **Fornecedor de material**: responde cotação via WhatsApp (preço, prazo, condição). Não acessa painel.
- **Admin do tenant**: gerencia usuários, obras, fornecedores cadastrados, política de aprovação, integração ERP.

### 1.3 Não-objetivos do MVP

- Gestão de mão de obra (empreitada/serviço) — fora de escopo no MVP. Pode entrar como módulo futuro.
- Locação de equipamentos — fora do MVP.
- Gestão de estoque na obra — fora. O sistema termina no pedido fechado; o ERP cuida do recebimento.
- Marketplace aberto (fornecedor não-cadastrado). MVP é multi-tenant fechado, cada construtora com sua rede.

---

## 2. Mapa de domínio (Glossário)

| Termo no CotaObra | Equivalente no CotaAgro | Definição |
|-------------------|--------------------------|------------|
| Construtora (`Tenant`) | Tenant | Entidade jurídica que assina a plataforma. Pode ter várias obras e usuários. |
| Obra (`Site`) | (não existia, modelo novo) | Projeto/canteiro com endereço, CNO, responsável, status (em andamento, paralisada, encerrada). |
| Solicitante (`Requester`) | (parcialmente: Producer) | Usuário que abre a solicitação. Geralmente engenheiro/encarregado vinculado a uma obra. |
| Comprador (`Buyer`) | (parcialmente: Producer) | Usuário do setor de Suprimentos que dispara cotações e fecha pedidos. |
| Fornecedor (`Supplier`) | Supplier | Empresa que fornece material. Tem categorias atendidas, regiões de entrega e WhatsApp. |
| Cotação (`Quote`) | Quote | Demanda de cotação criada. Tem itens, obra de destino, prazo, condição. |
| Item da cotação (`QuoteItem`) | (no CotaAgro era único campo) | Linha de material da cotação (produto, quantidade, unidade, especificação). |
| Proposta (`Proposal`) | Proposal | Resposta de um fornecedor a uma cotação. Tem preço por item, prazo, frete, pagamento. |
| Pedido (`PurchaseOrder`) | (parcialmente: Quote fechada) | Resultado da cotação fechada com um fornecedor (ou vários, em modo split). |
| Categoria (`Category`) | Category | Categoria de material (cimento, agregados, aço, blocos, hidráulica, elétrica, acabamento). |

A introdução do conceito de **Obra** é a principal adaptação estrutural frente ao CotaAgro. No agro, o "produtor" é tipicamente uma única fazenda; na construção civil, uma construtora opera várias obras em paralelo, com endereços, CNOs e responsáveis distintos. A obra é a unidade de entrega e de rateio de custos — sem ela, o sistema não consegue calcular frete corretamente nem agrupar histórico por canteiro.

---

## 3. Escopo funcional do MVP

### 3.1 Solicitação de cotação (originada na obra)

- Engenheiro envia mensagem pelo WhatsApp ao número da plataforma.
- Fluxo conversacional (FSM) coleta: obra de destino, item(s), quantidade, unidade, especificação técnica opcional, prazo desejado, observações.
- Para multi-item, sistema gera link de formulário web (TTL configurável, ex. 24h) que o engenheiro preenche pelo celular.
- A solicitação entra na fila do comprador no painel web com status `AWAITING_BUYER_REVIEW`.

### 3.2 Revisão e disparo pelo comprador (painel web)

- Comprador vê fila de solicitações por obra e prioridade.
- Revisa a solicitação, normaliza itens (mapeia para SKU/cadastro de material), define fornecedores-alvo (manualmente ou por sugestão automática baseada em categoria + região).
- Define tempo de expiração (default: 24h, configurável).
- Despacha. Status muda para `COLLECTING`.

### 3.3 Resposta do fornecedor (WhatsApp)

- Fornecedor recebe notificação no WhatsApp com resumo da cotação (template HSM aprovado pela Meta para iniciar conversa fora da janela de 24h).
- Item único: responde conversacionalmente preço/prazo/pagamento/frete/observação.
- Multi-item: recebe link de formulário web com TTL próprio.
- Validações: preço positivo, prazo ≥ 0, condição obrigatória (à vista, 28dd, 28/56dd, etc.).
- Após enviar, fornecedor recebe feedback com posição parcial no ranking e tempo restante.

### 3.4 Consolidação e decisão (painel web)

- Quando expira ou quando todos respondem, o sistema consolida.
- Quadro comparativo lado a lado por item + total por fornecedor.
- Ranking por **preço corrigido**: `preço × quantidade + frete + ajuste de prazo + ajuste de condição de pagamento`.
- Comprador pode: fechar com um fornecedor (winner-takes-all), fazer split por item (cada item com seu vencedor) ou cancelar a cotação.
- Em compras acima do teto configurado, o pedido vai para fila de aprovação do diretor antes de ser fechado.

### 3.5 Fechamento e pós-cotação

- Sistema gera pedido (PurchaseOrder) e notifica vencedor(es) via WhatsApp.
- Notifica fornecedores não vencedores com comparativo (sem expor preço dos outros — apenas posição).
- Gera PDF do pedido para anexar à OC do ERP.
- Atualiza histórico de preços do item por obra/região.

---

## 4. Arquitetura técnica

### 4.1 Stack (mantém a base do CotaAgro pelas mesmas razões: maturidade, talento disponível, custo controlado)

**Backend**
- Node.js 20 + TypeScript (strict mode)
- Express 4 como framework HTTP
- Prisma como ORM
- PostgreSQL 15 como banco transacional
- Redis 7 como cache de estado e fila
- Bull (sobre Redis) para jobs assíncronos
- node-cron para crons de expiração/consolidação
- Zod para validação de schemas
- Winston para logging estruturado
- Jest para testes
- OpenAI GPT-4o para NLU em mensagens livres (com fallback regex)
- Twilio / Meta Cloud API / Evolution API como provedores de WhatsApp (abstração via interface `IWhatsAppProvider`)

**Frontend (painel do comprador/admin)**
- React 18 + TypeScript
- Vite como build tool
- Tailwind CSS v4
- shadcn/ui como base de componentes
- React Query (TanStack) para estado de servidor
- React Router v6 para SPA
- Recharts para gráficos
- Lucide React para ícones
- React Hook Form + Zod resolvers para formulários

**Infra**
- Docker Compose para dev e single-node prod
- PostgreSQL gerenciado em produção (RDS, Supabase, Neon ou Render)
- MinIO (ou S3) para PDF de pedido e anexos
- Traefik + Let's Encrypt para HTTPS no VPS
- Sentry para erro
- PostHog ou Plausible para analytics (decisão no Sprint 1)

### 4.2 Diagrama de componentes

```
                     ┌───────────────┐
   Engenheiro <───── │   WhatsApp    │ ─────> Fornecedor
   (obra)            │  (Twilio/Evo) │
                     └───────┬───────┘
                             │ webhook
                             ▼
                     ┌───────────────┐
                     │   Express     │
                     │  API + WH     │
                     └───┬───────┬───┘
                         │       │
              ┌──────────┘       └────────────┐
              ▼                                ▼
        ┌──────────┐                    ┌──────────────┐
        │  FSM     │                    │  Bull Queues │
        │  Engine  │                    │  + Crons     │
        └────┬─────┘                    └──────┬───────┘
             │                                 │
             ▼                                 ▼
        ┌─────────────────────────────────────────┐
        │   PostgreSQL (state)  +  Redis (cache)  │
        └─────────────────────────────────────────┘
                             │
                             ▼
                     ┌───────────────┐
                     │ React Frontend│
                     │ (cockpit web) │
                     └───────────────┘
```

### 4.3 Camadas do backend

```
src/
├── config/            # Carrega env, instancia Prisma e Redis
├── types/             # Tipos globais
├── utils/             # Logger, validators, error handler
├── middleware/        # Auth JWT, RBAC, rate limit, tenant resolver, error handler
├── modules/
│   ├── auth/          # Login email+senha, OTP WhatsApp, refresh, 2FA admin
│   ├── tenants/       # CRUD de construtoras (super-admin)
│   ├── users/         # Usuários do tenant, RBAC granular
│   ├── sites/         # Obras (Site)
│   ├── suppliers/     # Fornecedores do tenant + rede CotaObra
│   ├── catalog/       # Catálogo de materiais (SKUs, categorias, unidades)
│   ├── quotes/        # CRUD de cotações + dispatch + close
│   ├── proposals/     # Recepção e leitura de propostas
│   ├── purchase-orders/  # Pedido gerado pós-cotação
│   ├── approvals/     # Fila de aprovação por teto
│   ├── reports/       # Funil, economia, performance por fornecedor, histórico de preços
│   ├── settings/      # Política de aprovação, tetos, defaults
│   ├── whatsapp/      # Webhook + serviço de envio (provider-agnostic)
│   ├── nlu/           # Wrapper OpenAI + fallback regex
│   └── billing/       # Stripe/Pagar.me/Asaas + planos
├── flows/             # FSM do solicitante e do fornecedor + templates
├── jobs/              # dispatch-quote, consolidate-quote, expire-quote, send-followups
├── app.ts             # Composição
└── server.ts          # Bootstrap
```

### 4.4 Multi-tenancy

- Toda tabela com `tenantId` indexado.
- `TenantResolver` middleware lê do JWT e injeta no request; queries Prisma extendem o filtro via middleware Prisma (`$use`).
- Fornecedores podem ser `tenantId` específico (rede do cliente) ou `null` (rede CotaObra, compartilhada).
- Isolamento de storage: prefixo do bucket S3/MinIO por tenant.

---

## 5. Modelo de dados (Prisma — recorte essencial)

> O modelo abaixo é o recorte mínimo do MVP. Detalhes operacionais (auditoria, soft delete, encryption) ficam para o backlog.

```prisma
model Tenant {
  id        String   @id @default(uuid())
  name      String
  slug      String   @unique
  cnpj      String?
  email     String?
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  users     User[]
  sites     Site[]
  suppliers Supplier[]
  quotes    Quote[]
  proposals Proposal[]
  settings  TenantSettings?

  @@map("tenants")
}

model User {
  id        String   @id @default(uuid())
  tenantId  String
  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  name      String
  email     String
  phone     String   // WhatsApp do usuário (para OTP e notificações)
  role      Role     // ADMIN | BUYER | REQUESTER | APPROVER
  password  String   // bcrypt
  active    Boolean  @default(true)
  permissions Json?  // RBAC granular por módulo
  lastLoginAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([tenantId, email])
  @@unique([tenantId, phone])
  @@index([tenantId])
  @@map("users")
}

enum Role {
  ADMIN
  BUYER
  REQUESTER
  APPROVER
}

model Site {
  id            String   @id @default(uuid())
  tenantId      String
  tenant        Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  name          String   // "Residencial Aurora — Torre A"
  cno           String?  // Cadastro Nacional de Obra
  address       String
  city          String
  state         String
  zip           String
  region        String   // micro-região para sugestão de fornecedores
  manager       String?  // Engenheiro responsável
  managerPhone  String?  // WhatsApp do engenheiro (vincula solicitação)
  budget        Decimal? @db.Decimal(15,2)
  status        SiteStatus @default(ACTIVE)
  startAt       DateTime?
  endAt         DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  quotes        Quote[]

  @@index([tenantId])
  @@index([region])
  @@map("sites")
}

enum SiteStatus { ACTIVE PAUSED CLOSED }

model Supplier {
  id                String   @id @default(uuid())
  tenantId          String?  // null = rede CotaObra (compartilhada)
  tenant            Tenant?  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  name              String
  company           String?
  phone             String   // WhatsApp do fornecedor
  email             String?
  cnpj              String?
  regions           String[] // regiões atendidas
  categories        String[] // ex.: ["cimento","agregados","aco"]
  isNetworkSupplier Boolean  @default(false)
  rating            Float    @default(0)
  totalProposals    Int      @default(0)
  acceptedProposals Int      @default(0)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  proposals         Proposal[]

  @@unique([tenantId, phone])
  @@index([tenantId])
  @@index([phone])
  @@map("suppliers")
}

model Material {
  id          String   @id @default(uuid())
  tenantId    String?  // null = catálogo CotaObra; sobrescrita por tenant cria custom
  sku         String?  // SKU interno do tenant (opcional)
  name        String   // "Cimento CP-II-Z 50kg"
  category    String   // "cimento"
  defaultUnit String   // "saca" | "m3" | "kg" | "t" | "pc" | "m" | "m2"
  spec        String?  // especificação técnica padrão (NBR, marca aceita)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  quoteItems  QuoteItem[]

  @@index([tenantId])
  @@index([category])
  @@map("materials")
}

model Quote {
  id              String   @id @default(uuid())
  tenantId        String
  tenant          Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  siteId          String
  site            Site     @relation(fields: [siteId], references: [id])
  requesterId     String?  // User que abriu (se via WhatsApp pode vir nulo até vincular)
  buyerId         String?  // User comprador que assumiu
  number          Int      // sequencial por tenant (humano)
  status          QuoteStatus @default(AWAITING_BUYER_REVIEW)
  supplierScope   SupplierScope @default(MINE) // MINE | NETWORK | ALL
  freightMode     FreightMode @default(CIF)   // CIF | FOB
  paymentTermsHint String?
  deadlineAt      DateTime?  // prazo de entrega desejado
  expiresAt       DateTime?  // quando a cotação fecha para propostas
  observation     String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  closedAt        DateTime?

  items           QuoteItem[]
  proposals       Proposal[]
  notifications   QuoteSupplierNotification[]
  purchaseOrder   PurchaseOrder?

  @@unique([tenantId, number])
  @@index([tenantId, status])
  @@index([siteId])
  @@index([expiresAt])
  @@map("quotes")
}

enum QuoteStatus {
  AWAITING_BUYER_REVIEW
  COLLECTING
  SUMMARIZED
  AWAITING_APPROVAL
  CLOSED
  EXPIRED
  CANCELED
}

enum SupplierScope { MINE NETWORK ALL }
enum FreightMode { CIF FOB }

model QuoteItem {
  id          String   @id @default(uuid())
  quoteId     String
  quote       Quote    @relation(fields: [quoteId], references: [id], onDelete: Cascade)
  materialId  String?  // pode ficar null se item não-catalogado
  material    Material? @relation(fields: [materialId], references: [id])
  description String   // descrição livre (vinda do solicitante)
  quantity    Decimal  @db.Decimal(15,3)
  unit        String   // saca, m3, kg, t, pc, m, m2
  spec        String?  // especificação adicional
  order       Int      @default(0)

  proposalItems ProposalItem[]

  @@index([quoteId])
  @@map("quote_items")
}

model Proposal {
  id              String   @id @default(uuid())
  tenantId        String
  tenant          Tenant   @relation(fields: [tenantId], references: [id])
  quoteId         String
  quote           Quote    @relation(fields: [quoteId], references: [id], onDelete: Cascade)
  supplierId      String
  supplier        Supplier @relation(fields: [supplierId], references: [id])
  freightValue    Decimal? @db.Decimal(15,2)
  paymentTerms    String   // "AVISTA" | "28DD" | "28/56DD" | "30/60/90"
  deliveryDays    Int      // prazo em dias úteis
  observation     String?
  totalValue      Decimal? @db.Decimal(15,2) // calculado (sum de items + frete)
  correctedTotal  Decimal? @db.Decimal(15,2) // total ajustado por prazo/condição (ranking)
  rank            Int?     // posição final no ranking
  isWinner        Boolean  @default(false)
  receivedAt      DateTime @default(now())

  items           ProposalItem[]

  @@unique([quoteId, supplierId])
  @@index([quoteId])
  @@index([supplierId])
  @@map("proposals")
}

model ProposalItem {
  id          String   @id @default(uuid())
  proposalId  String
  proposal    Proposal @relation(fields: [proposalId], references: [id], onDelete: Cascade)
  quoteItemId String
  quoteItem   QuoteItem @relation(fields: [quoteItemId], references: [id])
  unitPrice   Decimal  @db.Decimal(15,4)
  totalPrice  Decimal  @db.Decimal(15,2)
  available   Boolean  @default(true) // fornecedor pode marcar item indisponível
  rank        Int?

  @@unique([proposalId, quoteItemId])
  @@map("proposal_items")
}

model PurchaseOrder {
  id              String   @id @default(uuid())
  tenantId        String
  quoteId         String   @unique
  quote           Quote    @relation(fields: [quoteId], references: [id])
  supplierId      String
  totalValue      Decimal  @db.Decimal(15,2)
  paymentTerms    String
  deliveryDays    Int
  pdfUrl          String?  // MinIO/S3
  approvedById    String?
  createdAt       DateTime @default(now())

  @@index([tenantId])
  @@map("purchase_orders")
}

model TenantSettings {
  id                  String  @id @default(uuid())
  tenantId            String  @unique
  tenant              Tenant  @relation(fields: [tenantId], references: [id])
  defaultExpiryHours  Int     @default(24)
  defaultDeadlineDays Int     @default(5)
  approvalThreshold   Decimal? @db.Decimal(15,2) // teto que aciona aprovação
  paymentPolicy       Json?   // pesos para correção de ranking
  autoNotifyWinner    Boolean @default(true)
  whatsappProvider    String  @default("twilio") // twilio | meta | evolution

  @@map("tenant_settings")
}

model QuoteSupplierNotification {
  id          String   @id @default(uuid())
  quoteId     String
  quote       Quote    @relation(fields: [quoteId], references: [id], onDelete: Cascade)
  supplierId  String
  status      String   // PENDING | SENT | DELIVERED | READ | FAILED
  sentAt      DateTime?
  deliveredAt DateTime?
  readAt      DateTime?
  errorMsg    String?

  @@unique([quoteId, supplierId])
  @@map("quote_supplier_notifications")
}

model ConversationState {
  id          String   @id @default(uuid())
  tenantId    String
  phone       String   // chave de conversa (engenheiro OU fornecedor)
  role        String   // REQUESTER | SUPPLIER
  step        String   // estado FSM atual
  context     Json     // payload acumulado
  expiresAt   DateTime
  updatedAt   DateTime @updatedAt

  @@unique([tenantId, phone])
  @@index([expiresAt])
  @@map("conversation_states")
}
```

---

## 6. Máquinas de estado (FSM)

### 6.1 FSM do solicitante (engenheiro de obra via WhatsApp)

```
IDLE
  └─> AWAITING_SITE_SELECTION         (se engenheiro tem >1 obra)
       └─> AWAITING_MODE              (item único | multi-item)
            ├─> AWAITING_MATERIAL     (item único)
            │     └─> AWAITING_QUANTITY
            │           └─> AWAITING_UNIT
            │                 └─> AWAITING_SPEC          (opcional)
            │                       └─> AWAITING_DEADLINE
            │                             └─> AWAITING_OBSERVATION
            │                                   └─> AWAITING_CONFIRMATION
            │                                         └─> SUBMITTED
            └─> WAITING_FORM_SUBMISSION (multi-item via link web)
                  └─> SUBMITTED
```

Notas de implementação:
- O vínculo solicitante↔obra usa o número de WhatsApp do `manager`/`User.phone`. Se o número corresponde a mais de uma obra, o sistema lista e pede seleção numérica.
- Cada transição é gravada em `ConversationState.context` com idempotência por `messageId`.
- Smart-fill com NLU: ao detectar mensagem inicial livre ("preciso de 200 sacas de cimento na obra Aurora pra sexta"), GPT-4o extrai entidades e pula etapas.

### 6.2 FSM do fornecedor (via WhatsApp)

```
SUPPLIER_IDLE
  └─> AWAITING_OPT_IN                 (responde "1" pra participar)
       └─> AWAITING_PRICE             (item único; multi-item usa form)
            └─> AWAITING_DELIVERY_DAYS
                  └─> AWAITING_PAYMENT_TERMS
                       └─> AWAITING_FREIGHT
                             └─> AWAITING_OBSERVATION
                                   └─> SUBMITTED
                                         └─> AWAITING_RESULT
```

Resiliência: estado persistido em PostgreSQL (não só Redis). Redis serve de cache de leitura.

### 6.3 Estado da cotação (lado backoffice)

```
AWAITING_BUYER_REVIEW
  ├─> COLLECTING            (comprador dispara)
  │     ├─> SUMMARIZED      (todos respondem ou expira)
  │     │     ├─> AWAITING_APPROVAL  (acima do teto)
  │     │     │     ├─> CLOSED       (aprovado e fechado)
  │     │     │     └─> CANCELED
  │     │     └─> CLOSED
  │     └─> EXPIRED         (zero respostas)
  └─> CANCELED              (comprador cancela antes do disparo)
```

---

## 7. Jobs assíncronos e crons

| Job | Tipo | Frequência | Responsabilidade |
|-----|------|------------|------------------|
| `dispatch-quote` | Bull queue | sob demanda | Notifica fornecedores selecionados, cria `QuoteSupplierNotification`, dispara HSM se conversa fora da janela 24h. |
| `consolidate-quote` | Cron | a cada 5 min | Para cada quote `COLLECTING` com `expiresAt` vencido OU 100% respondida: calcula ranking corrigido, envia resumo ao comprador (push + email) e marca `SUMMARIZED`. |
| `expire-quote` | Cron | a cada 10 min | Marca como `EXPIRED` cotações `COLLECTING` sem resposta vencidas. |
| `send-followup` | Cron | a cada 30 min | Manda lembrete HSM a fornecedores que ainda não responderam, respeitando rate limit do tenant. |
| `notify-winner` | Bull queue | sob demanda | Após `CLOSED`, notifica vencedor(es) e perdedores; gera PDF. |
| `cleanup-conv-states` | Cron | diário | Apaga `ConversationState` expirados. |
| `recalculate-price-history` | Cron | diário 03:00 | Atualiza tabela materializada de histórico de preços por material/região. |

Lock distribuído em `consolidate-quote` e `expire-quote` (Redlock) para evitar race condition entre instâncias — lição direta do CotaAgro (TASK 1.1 do backlog daquele projeto).

---

## 8. Endpoints REST (recorte do MVP)

### 8.1 Auth
```
POST   /api/auth/login                # email+senha
POST   /api/auth/otp                  # solicita OTP WhatsApp
POST   /api/auth/otp/verify           # valida OTP e retorna JWT
POST   /api/auth/refresh              # refresh token
POST   /api/auth/logout
POST   /api/auth/forgot-password
POST   /api/auth/reset-password
```

### 8.2 Obras
```
GET    /api/sites
POST   /api/sites
GET    /api/sites/:id
PATCH  /api/sites/:id
DELETE /api/sites/:id                 # soft delete (status=CLOSED)
```

### 8.3 Fornecedores
```
GET    /api/suppliers
POST   /api/suppliers
GET    /api/suppliers/:id
PATCH  /api/suppliers/:id
DELETE /api/suppliers/:id
POST   /api/suppliers/:id/invite      # convida fornecedor para se cadastrar via WhatsApp
```

### 8.4 Catálogo de materiais
```
GET    /api/materials?category=...
POST   /api/materials
PATCH  /api/materials/:id
DELETE /api/materials/:id
```

### 8.5 Cotações
```
GET    /api/quotes?status=...&siteId=...
POST   /api/quotes                    # comprador cria direto pelo painel
GET    /api/quotes/:id
PATCH  /api/quotes/:id                # editar itens / observações
POST   /api/quotes/:id/dispatch       # dispara aos fornecedores
POST   /api/quotes/:id/close          # fecha (winner-takes-all ou split)
POST   /api/quotes/:id/cancel
GET    /api/quotes/:id/comparative    # quadro comparativo para a UI
GET    /api/quotes/:id/pdf            # gera/baixa PDF
```

### 8.6 Solicitações via WhatsApp (entram via webhook, mas listadas aqui)
```
GET    /api/quote-requests            # fila de solicitações pendentes (do comprador)
POST   /api/quote-requests/:id/promote # vira Quote em AWAITING_BUYER_REVIEW
```

### 8.7 Propostas (form web do fornecedor)
```
GET    /api/proposal-form/:token      # carrega form (público, com token)
POST   /api/proposal-form/:token      # submete proposta
```

### 8.8 Aprovações
```
GET    /api/approvals?status=pending
POST   /api/approvals/:id/approve
POST   /api/approvals/:id/reject
```

### 8.9 Settings
```
GET    /api/settings
PATCH  /api/settings
```

### 8.10 Relatórios
```
GET    /api/reports/funnel
GET    /api/reports/savings
GET    /api/reports/supplier-performance
GET    /api/reports/price-history?materialId=...&region=...
GET    /api/reports/site-spend?siteId=...
```

### 8.11 WhatsApp
```
GET    /api/whatsapp/webhook          # verification (Meta/Twilio)
POST   /api/whatsapp/webhook          # eventos
POST   /api/whatsapp/status-callback  # delivery/read receipts
```

---

## 9. Telas do painel web (MVP)

| Tela | Objetivo | Prioridade |
|------|----------|------------|
| Login | Autenticar usuário do tenant. | P0 |
| Dashboard | KPIs: cotações abertas, propostas pendentes, economia 30d, SLA médio de resposta, fornecedores ativos. | P0 |
| Solicitações pendentes | Fila do comprador (origem WhatsApp ou direto), com triagem. | P0 |
| Cotações | Lista filtrável (status, obra, período). | P0 |
| Detalhe da cotação | Itens + propostas + quadro comparativo + ações (dispatch/close/cancel). | P0 |
| Obras | CRUD de obras. | P0 |
| Fornecedores | CRUD + categorias + regiões. | P0 |
| Catálogo de materiais | CRUD de SKUs internos. | P1 |
| Usuários | RBAC granular. | P1 |
| Aprovações | Fila do diretor (compras acima do teto). | P0 |
| Relatórios | 5 relatórios essenciais. | P1 |
| Configurações | Defaults, teto de aprovação, política de pagamento, provedor WhatsApp. | P0 |
| Onboarding checklist | Guia primeira-cotação (auto-tour). | P1 |

---

## 10. Algoritmo de ranking (preço corrigido)

Para tornar comparáveis propostas com prazos e condições diferentes:

```
correctedTotal =
    sum(item.totalPrice)
  + freightValue (se FOB, valor zero)
  + custoFinanceiro(paymentTerms)
  + ajusteEntrega(deliveryDays, deadlineDays)
```

- `custoFinanceiro`: aplica taxa diária (configurável em settings — default 1.0% ao mês) sobre o saldo ponderado conforme parcelamento. À vista é o piso.
- `ajusteEntrega`: penalidade percentual por dia de atraso versus `deadlineDays` da cotação. Default: 0.5% por dia de atraso, sem bônus por antecipação.

O comprador vê o `totalValue` original e o `correctedTotal` lado a lado. O ranking é sempre por `correctedTotal`, mas a decisão final é manual.

---

## 11. Política de WhatsApp e templates HSM

Como toda mensagem para fornecedor parte do CotaObra (e não do fornecedor), 95% dos disparos caem fora da janela de 24h da Meta. Portanto **a infraestrutura precisa de templates HSM aprovados desde o dia 1**, sob pena de bloqueio do número (lição direta do CotaAgro — AUD-04 do auditoria-de-inconsistências).

Templates mínimos para MVP:
- `cotacao_nova` — abertura para fornecedor.
- `cotacao_followup` — lembrete a quem não respondeu.
- `cotacao_resultado_vencedor` — notificação ao vencedor.
- `cotacao_resultado_perdedor` — notificação ao não-selecionado (comparativo sem expor preços absolutos).
- `cotacao_expirada_sem_resposta` — aviso ao fornecedor que não respondeu.
- `solicitacao_recebida` — confirmação ao engenheiro de que a solicitação chegou ao comprador.

Cada template tem variáveis (`{{1}}, {{2}}, ...`) e idiomas (`pt_BR`). Versões precisam ser submetidas à aprovação da Meta antes do go-live de cada cliente.

---

## 12. Segurança

- JWT (access 15min + refresh 90 dias), blacklist em Redis no logout, rate limit 5/15min no login por IP.
- OTP de 6 dígitos via WhatsApp para login passwordless (TTL 10min).
- 2FA obrigatório para `ADMIN` (TOTP + OTP WhatsApp).
- RBAC granular: por módulo (cotações/fornecedores/obras/aprovações/relatórios/configurações) com leitura/escrita/exclusão.
- Validação Zod em todos os endpoints.
- Helmet, CORS por whitelist por tenant.
- Rate limit por telefone (30msg/min) e por IP (1000req/h).
- Webhook do WhatsApp valida assinatura por tenant.
- CNPJ e telefone armazenados com hash (SHA-256) para busca + valor criptografado (AES-256-GCM) — LGPD.
- Logs estruturados com `tenantId`, `userId`, `quoteId` sempre presentes.
- Soft delete em entidades críticas (Quote, PurchaseOrder, Supplier, User).
- Backup diário (PostgreSQL) com retenção 30 dias; Redis snapshot a cada 6h.

---

## 13. Observabilidade

- Sentry para erros (frontend + backend) desde o sprint 1.
- Health checks: `/health`, `/health/db`, `/health/redis`, `/health/whatsapp`.
- Métricas Prometheus expostas em `/metrics`: latência por endpoint, profundidade da fila Bull, falhas de envio WhatsApp, FSM throughput.
- Logs em JSON via Winston, com correlation-id por request.
- PostHog (ou Mixpanel) para tracking de eventos de produto desde dia 1.

---

## 14. Testes

| Camada | Cobertura mínima | Foco crítico |
|--------|------------------|---------------|
| Unit (Jest) | 60% backend | FSM, ranking, jobs, validators |
| Integration (Supertest) | controllers principais | quotes/dispatch, proposal submit, close |
| E2E (Playwright) | 5 fluxos | login, criar cotação, dispatch, fechar, aprovação |

CI: GitHub Actions com matrix de Node 20 e PostgreSQL 15. Bloqueia merge se cobertura < 60% ou lint falhar.

---

## 15. Roadmap técnico (visão geral)

| Fase | Duração | Foco | Saída esperada |
|------|---------|------|----------------|
| Fundação | 2 sprints | Auth, multi-tenant, schema, CI/CD, observabilidade | Base operacional em staging. |
| Cotação ponta-a-ponta | 3 sprints | FSM solicitante, dispatch, FSM fornecedor, consolidação, painel web | Fluxo fim-a-fim em produção piloto. |
| Aprovação e relatórios | 2 sprints | Aprovação por teto, relatórios essenciais, PDF do pedido | Cliente piloto fechando 10 cotações/semana. |
| Crescimento | 2 sprints | Catálogo SKU, integração ERP via webhook, split de pedido | Pronto para venda. |
| Diferenciação | 2+ sprints | BI de preços, recomendação de fornecedor, app mobile PWA | Roadmap v2. |

**Total MVP: ~9 sprints (18 semanas).** Detalhamento de tarefas no documento de Backlog.

---

## 16. Decisões abertas (para próximas reuniões)

- Provedor primário de WhatsApp: Twilio (caro, mas estável e com SLA) versus Meta Cloud API (barato, exige mais infra) versus Evolution API self-hosted (barato, risco de bloqueio).
- Gateway de pagamento: Stripe (internacional, exige BR via parceiros) versus Pagar.me/Asaas (BR, suporta Pix recorrente).
- Catálogo de materiais: começar com lista pré-pronta (CotaObra curated, ~500 SKUs nacionais com base no SINAPI) versus partir do branco e cada cliente popular o seu.
- Mobile do engenheiro: PWA agora ou app nativo no v2.
- Integração ERP: webhook outbound (simples) versus integração nativa com 1–2 ERPs (Sienge, GVdasa) já no MVP.

---

## 17. Anexo: comparação CotaAgro → CotaObra (decisões de adaptação)

| Aspecto | CotaAgro | CotaObra |
|---------|----------|----------|
| Persona primária no campo | Produtor rural (1 pessoa) | Engenheiro/encarregado vinculado a uma obra |
| Persona primária no backoffice | Não há (produtor faz tudo) | Comprador / Suprimentos |
| Unidade de organização | Producer (1:1 com fazenda) | Site/Obra (N por construtora) |
| Disparo da cotação | Produtor inicia direto pelo WhatsApp | Engenheiro solicita → comprador revisa → dispara |
| Aprovação hierárquica | Não tem | Tem (configurável por teto) |
| Catálogo de itens | Aberto, baseado em texto livre + NLU | Catálogo de materiais + texto livre |
| Modelo de ranking | Apenas preço total + prazo | Preço corrigido (preço + frete + custo financeiro + ajuste de prazo) |
| Resultado | Cotação fechada com 1 fornecedor | Pode ser split por item (cada item com seu vencedor) |
| Saída final | Mensagem WhatsApp + tela web | Mensagem + PDF de pedido para anexar à OC do ERP |
| Multi-tenant | Sim | Sim (mantido) |
| LGPD | Hash + cripto CPF/CNPJ | Hash + cripto CNPJ |

---

**Fim do documento.**
