/**
 * Setup Guide Component
 *
 * Manual explicativo passo a passo para configuração do WhatsApp
 */

import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import {
  BookOpen,
  CheckCircle,
  AlertTriangle,
  Info,
  ExternalLink,
  Smartphone,
  Key,
  Globe,
  RefreshCw,
  QrCode,
  Shield,
  Zap,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useState } from 'react';

interface SetupGuideProps {
  provider: 'twilio' | 'evolution' | 'meta';
}

export function SetupGuide({ provider }: SetupGuideProps) {
  const [expandedSections, setExpandedSections] = useState<string[]>(['intro']);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) =>
      prev.includes(section) ? prev.filter((s) => s !== section) : [...prev, section]
    );
  };

  const isExpanded = (section: string) => expandedSections.includes(section);

  // Conteúdo específico por provider
  const getProviderGuide = () => {
    switch (provider) {
      case 'evolution':
        return <EvolutionGuide isExpanded={isExpanded} toggleSection={toggleSection} />;
      case 'twilio':
        return <TwilioGuide isExpanded={isExpanded} toggleSection={toggleSection} />;
      case 'meta':
        return <MetaGuide isExpanded={isExpanded} toggleSection={toggleSection} />;
      default:
        return null;
    }
  };

  return (
    <Card className="p-6 bg-muted/30 border-primary/20">
      <div className="flex items-center gap-2 mb-4">
        <BookOpen className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold text-foreground">Manual de Configuração</h3>
        <Badge variant="secondary" className="ml-auto">
          {provider === 'evolution' ? 'Recomendado' : provider.toUpperCase()}
        </Badge>
      </div>

      <p className="text-sm text-muted-foreground mb-6">
        Siga o passo a passo abaixo para configurar o WhatsApp de forma correta e sem erros.
      </p>

      {getProviderGuide()}
    </Card>
  );
}

// Evolution API Guide
function EvolutionGuide({
  isExpanded,
  toggleSection,
}: {
  isExpanded: (s: string) => boolean;
  toggleSection: (s: string) => void;
}) {
  return (
    <div className="space-y-3">
      {/* Seção 1: Introdução */}
      <GuideSection
        icon={Info}
        title="1. Por que Evolution API?"
        isExpanded={isExpanded('intro')}
        onToggle={() => toggleSection('intro')}
      >
        <div className="space-y-3">
          <p className="text-sm text-foreground">
            A <strong>Evolution API</strong> é a solução mais completa e confiável para integração
            com WhatsApp no Brasil. Oferece:
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-success mt-0.5 shrink-0" />
              <span>✅ API oficial baseada no Baileys (WhatsApp Web)</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-success mt-0.5 shrink-0" />
              <span>✅ Suporte completo a mensagens, imagens, áudios e documentos</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-success mt-0.5 shrink-0" />
              <span>✅ Webhooks em tempo real para receber mensagens</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-success mt-0.5 shrink-0" />
              <span>✅ Sem custos mensais (self-hosted)</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-success mt-0.5 shrink-0" />
              <span>✅ Documentação em português e suporte ativo</span>
            </li>
          </ul>
        </div>
      </GuideSection>

      {/* Seção 2: Obtendo a API Key */}
      <GuideSection
        icon={Key}
        title="2. Obtendo sua API Key"
        isExpanded={isExpanded('apikey')}
        onToggle={() => toggleSection('apikey')}
        badge="Obrigatório"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Passo 1: Acesse o painel</p>
            <p className="text-sm text-muted-foreground">
              Acesse o painel da Evolution API no endereço configurado pelo seu provedor. Exemplo:
            </p>
            <CodeBlock>https://api.seudominio.com.br/manager</CodeBlock>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Passo 2: Faça login</p>
            <p className="text-sm text-muted-foreground">
              Use as credenciais fornecidas pelo administrador da API.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Passo 3: Crie uma instância</p>
            <p className="text-sm text-muted-foreground">
              Clique em <strong>"Nova Instância"</strong> ou <strong>"Create Instance"</strong>
            </p>
            <ul className="text-xs text-muted-foreground space-y-1 ml-4">
              <li>• Nome: <code className="text-foreground">cotaobra-{'{seu-nome}'}</code></li>
              <li>• Tipo: WhatsApp</li>
              <li>• Webhook: Deixe em branco por enquanto</li>
            </ul>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Passo 4: Copie a API Key</p>
            <p className="text-sm text-muted-foreground">
              Após criar a instância, você verá uma <strong>API Key</strong> gerada. Copie ela e
              cole no campo <strong>"API Token"</strong> acima.
            </p>
            <InfoBox>
              <strong>Importante:</strong> Guarde essa chave em local seguro. Ela será necessária
              para todas as requisições.
            </InfoBox>
          </div>
        </div>
      </GuideSection>

      {/* Seção 3: Configurando a URL Base */}
      <GuideSection
        icon={Globe}
        title="3. Configurando a URL Base"
        isExpanded={isExpanded('baseurl')}
        onToggle={() => toggleSection('baseurl')}
        badge="Obrigatório"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            A <strong>URL Base</strong> é o endereço do servidor onde a Evolution API está rodando.
          </p>

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Formatos comuns:</p>
            <CodeBlock>https://api.seudominio.com.br</CodeBlock>
            <CodeBlock>https://evolution.seuservidor.com</CodeBlock>
            <CodeBlock>http://IP-DO-SERVIDOR:8080</CodeBlock>
          </div>

          <WarningBox>
            <strong>Atenção:</strong> Não inclua "/" no final da URL. Use exatamente como mostrado
            acima.
          </WarningBox>

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Como descobrir a URL:</p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Pergunte ao administrador do servidor</li>
              <li>• Verifique a documentação da sua hospedagem</li>
              <li>• Se self-hosted, use o IP público + porta configurada</li>
            </ul>
          </div>
        </div>
      </GuideSection>

      {/* Seção 4: Nome da Instância */}
      <GuideSection
        icon={Smartphone}
        title="4. Nome da Instância"
        isExpanded={isExpanded('instance')}
        onToggle={() => toggleSection('instance')}
        badge="Obrigatório"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            O <strong>Instance Name</strong> é o identificador único da sua conexão WhatsApp.
          </p>

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Regras para o nome:</p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Use apenas letras minúsculas e números</li>
              <li>• Sem espaços (use hífen se necessário)</li>
              <li>• Exemplos: <code className="text-foreground">cotaobra-producao</code></li>
            </ul>
          </div>

          <InfoBox>
            <strong>Dica:</strong> Use o mesmo nome que você configurou no painel da Evolution API
            no passo 2.
          </InfoBox>
        </div>
      </GuideSection>

      {/* Seção 5: Conectando o WhatsApp */}
      <GuideSection
        icon={QrCode}
        title="5. Conectando seu WhatsApp"
        isExpanded={isExpanded('qrcode')}
        onToggle={() => toggleSection('qrcode')}
        badge="Último passo"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Após salvar a configuração, você precisa conectar seu número do WhatsApp.
          </p>

          <div className="space-y-3">
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Passo 1: Clique em "Gerar QR Code"</p>
              <p className="text-sm text-muted-foreground">
                Um QR Code será gerado para você escanear com seu WhatsApp.
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Passo 2: Abra o WhatsApp no celular</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Toque nos <strong>3 pontinhos</strong> (Android) ou <strong>Configurações</strong> (iOS)</li>
                <li>• Vá em <strong>"Aparelhos conectados"</strong></li>
                <li>• Toque em <strong>"Conectar um aparelho"</strong></li>
              </ul>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Passo 3: Escaneie o QR Code</p>
              <p className="text-sm text-muted-foreground">
                Aponte a câmera para o QR Code exibido na tela. A conexão será estabelecida
                automaticamente.
              </p>
            </div>
          </div>

          <SuccessBox>
            <strong>Pronto!</strong> Seu WhatsApp está conectado e pronto para enviar e receber
            mensagens automáticas.
          </SuccessBox>
        </div>
      </GuideSection>

      {/* Seção 6: Troubleshooting */}
      <GuideSection
        icon={AlertTriangle}
        title="6. Problemas Comuns"
        isExpanded={isExpanded('troubleshooting')}
        onToggle={() => toggleSection('troubleshooting')}
      >
        <div className="space-y-4">
          <TroubleshootItem
            problem="Erro: Failed to connect"
            solutions={[
              'Verifique se a URL Base está correta (sem "/" no final)',
              'Confirme que o servidor Evolution API está online',
              'Teste acessando a URL Base no navegador',
              'Verifique o firewall e libere a porta necessária',
            ]}
          />

          <TroubleshootItem
            problem="Erro: Invalid API Key"
            solutions={[
              'Copie novamente a API Key do painel da Evolution',
              'Verifique se não há espaços antes ou depois da chave',
              'Confirme que a instância foi criada corretamente',
              'Tente recriar a instância no painel Evolution',
            ]}
          />

          <TroubleshootItem
            problem="QR Code não aparece"
            solutions={[
              'Salve a configuração primeiro antes de gerar o QR Code',
              'Aguarde alguns segundos e tente novamente',
              'Verifique se o WhatsApp já não está conectado',
              'Clique em "Reconectar" no card de status',
            ]}
          />

          <TroubleshootItem
            problem="WhatsApp desconecta sozinho"
            solutions={[
              'Verifique a estabilidade da conexão com o servidor',
              'Não desconecte o número de outros aparelhos',
              'Mantenha o WhatsApp atualizado no celular',
              'Configure um webhook para receber notificações de desconexão',
            ]}
          />
        </div>
      </GuideSection>

      {/* Seção 7: Boas Práticas */}
      <GuideSection
        icon={Shield}
        title="7. Boas Práticas e Segurança"
        isExpanded={isExpanded('best-practices')}
        onToggle={() => toggleSection('best-practices')}
      >
        <div className="space-y-3">
          <BestPracticeItem
            icon={Shield}
            title="Segurança"
            tips={[
              'Nunca compartilhe sua API Key publicamente',
              'Use HTTPS (SSL) sempre que possível',
              'Mantenha backups das configurações',
            ]}
          />

          <BestPracticeItem
            icon={Zap}
            title="Performance"
            tips={[
              'Evite enviar mais de 20 mensagens por minuto',
              'Use templates para mensagens frequentes',
              'Configure rate limiting no servidor',
            ]}
          />

          <BestPracticeItem
            icon={RefreshCw}
            title="Manutenção"
            tips={[
              'Monitore o status da conexão regularmente',
              'Atualize a Evolution API quando houver novas versões',
              'Configure alertas de desconexão via webhook',
            ]}
          />
        </div>
      </GuideSection>

      {/* Links úteis */}
      <div className="mt-6 pt-6 border-t border-border">
        <p className="text-sm font-medium text-foreground mb-3">Links Úteis:</p>
        <div className="space-y-2">
          <ExternalLinkItem
            href="https://doc.evolution-api.com"
            label="Documentação oficial Evolution API"
          />
          <ExternalLinkItem
            href="https://github.com/EvolutionAPI/evolution-api"
            label="Repositório GitHub Evolution API"
          />
        </div>
      </div>
    </div>
  );
}

// Twilio Guide
function TwilioGuide({
  isExpanded,
  toggleSection,
}: {
  isExpanded: (s: string) => boolean;
  toggleSection: (s: string) => void;
}) {
  return (
    <div className="space-y-3">
      <GuideSection
        icon={Info}
        title="1. Criar conta no Twilio"
        isExpanded={isExpanded('twilio-account')}
        onToggle={() => toggleSection('twilio-account')}
      >
        <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
          <li>Acesse <strong>twilio.com</strong> e clique em "Sign Up"</li>
          <li>Preencha seus dados e confirme o e-mail</li>
          <li>No painel, acesse <strong>Account Info</strong> para obter seu <strong>Account SID</strong> e <strong>Auth Token</strong></li>
          <li>Copie ambos os valores — você vai precisar deles na configuração</li>
        </ol>
      </GuideSection>

      <GuideSection
        icon={Info}
        title="2. Ativar WhatsApp Sandbox"
        isExpanded={isExpanded('twilio-sandbox')}
        onToggle={() => toggleSection('twilio-sandbox')}
      >
        <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
          <li>No painel Twilio, vá em <strong>Messaging &gt; Try it out &gt; Send a WhatsApp message</strong></li>
          <li>Siga as instruções para conectar seu WhatsApp ao sandbox (enviar código via WhatsApp)</li>
          <li>Para produção: solicite um número dedicado em <strong>Messaging &gt; Senders &gt; WhatsApp senders</strong></li>
          <li>O número do WhatsApp será no formato <strong>whatsapp:+14155238886</strong> (sandbox) ou seu número dedicado</li>
        </ol>
      </GuideSection>

      <GuideSection
        icon={Info}
        title="3. Configurar Webhook"
        isExpanded={isExpanded('twilio-webhook')}
        onToggle={() => toggleSection('twilio-webhook')}
      >
        <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
          <li>No Twilio, vá em <strong>Messaging &gt; Settings &gt; WhatsApp sandbox settings</strong></li>
          <li>Em "When a message comes in", cole a URL: <code className="bg-muted px-1.5 py-0.5 rounded text-xs">https://seu-dominio.com/api/whatsapp/webhook</code></li>
          <li>Método: <strong>HTTP POST</strong></li>
          <li>Salve as configurações</li>
        </ol>
      </GuideSection>

      <GuideSection
        icon={Info}
        title="4. Configurar no CotaObra"
        isExpanded={isExpanded('twilio-config')}
        onToggle={() => toggleSection('twilio-config')}
      >
        <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
          <li>Selecione o provedor <strong>Twilio</strong> no passo anterior</li>
          <li>Cole o <strong>Account SID</strong> no campo correspondente</li>
          <li>Cole o <strong>Auth Token</strong></li>
          <li>Informe o <strong>Número WhatsApp</strong> (formato: +5564999999999)</li>
          <li>Clique em <strong>"Testar conexão"</strong> para verificar</li>
        </ol>
      </GuideSection>

      <InfoBox>
        <strong>Dica:</strong> Use o sandbox para testes gratuitos. Para produção, solicite aprovação do número comercial junto ao Twilio (processo leva 1-3 dias úteis).
      </InfoBox>
    </div>
  );
}

// Meta Guide
function MetaGuide({
  isExpanded,
  toggleSection,
}: {
  isExpanded: (s: string) => boolean;
  toggleSection: (s: string) => void;
}) {
  return (
    <div className="space-y-3">
      <GuideSection
        icon={Info}
        title="1. Pré-requisitos Meta Business"
        isExpanded={isExpanded('meta-prereq')}
        onToggle={() => toggleSection('meta-prereq')}
      >
        <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
          <li>Ter uma <strong>conta Meta Business</strong> verificada em <strong>business.facebook.com</strong></li>
          <li>Ter um <strong>aplicativo Meta</strong> criado em <strong>developers.facebook.com</strong></li>
          <li>A empresa deve ter <strong>CNPJ ativo</strong> para verificação do Meta Business</li>
          <li>O processo de verificação pode levar de <strong>2 a 7 dias úteis</strong></li>
        </ol>
      </GuideSection>

      <GuideSection
        icon={Info}
        title="2. Criar App e Ativar WhatsApp"
        isExpanded={isExpanded('meta-app')}
        onToggle={() => toggleSection('meta-app')}
      >
        <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
          <li>Em <strong>developers.facebook.com</strong>, clique em "Meus Aplicativos" &gt; "Criar Aplicativo"</li>
          <li>Selecione tipo <strong>"Business"</strong></li>
          <li>No painel do app, vá em <strong>"Adicionar produtos"</strong> e selecione <strong>"WhatsApp"</strong></li>
          <li>Siga o assistente para vincular sua conta Meta Business</li>
          <li>Em <strong>WhatsApp &gt; Getting Started</strong>, copie o <strong>Phone Number ID</strong> e o <strong>Access Token temporário</strong></li>
        </ol>
      </GuideSection>

      <GuideSection
        icon={Info}
        title="3. Configurar Número e Templates"
        isExpanded={isExpanded('meta-number')}
        onToggle={() => toggleSection('meta-number')}
      >
        <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
          <li>Em <strong>WhatsApp &gt; Phone Numbers</strong>, adicione e verifique seu número comercial</li>
          <li>Crie um <strong>Token de Acesso Permanente</strong> em <strong>Configurações do App &gt; Tokens</strong></li>
          <li>Configure o webhook: URL <code className="bg-muted px-1.5 py-0.5 rounded text-xs">https://seu-dominio.com/api/whatsapp/webhook</code></li>
          <li>Inscreva-se nos eventos: <strong>messages</strong>, <strong>messaging_postbacks</strong></li>
        </ol>
      </GuideSection>

      <GuideSection
        icon={Info}
        title="4. Gerar Token Permanente"
        isExpanded={isExpanded('meta-token')}
        onToggle={() => toggleSection('meta-token')}
      >
        <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
          <li>Vá em <strong>Configurações do App &gt; Básico</strong></li>
          <li>Clique em <strong>"Gerar Token"</strong> com permissões <strong>whatsapp_business_messaging</strong></li>
          <li>Copie o token — ele será usado na configuração do CotaObra</li>
          <li>Tokens temporários expiram em 24h; use o permanente para produção</li>
        </ol>
      </GuideSection>

      <InfoBox>
        <strong>Importante:</strong> A integração via Meta requer verificação da empresa (CNPJ) e aprovação de templates de mensagem. O processo completo pode levar até 2 semanas. Para começar mais rápido, considere usar a <strong>Evolution API</strong>.
      </InfoBox>
    </div>
  );
}

// Componentes auxiliares
function GuideSection({
  icon: Icon,
  title,
  badge,
  isExpanded,
  onToggle,
  children,
}: {
  icon: any;
  title: string;
  badge?: string;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-border rounded-lg overflow-hidden bg-background">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition"
      >
        <Icon className="w-5 h-5 text-primary shrink-0" />
        <span className="text-sm font-medium text-foreground flex-1 text-left">{title}</span>
        {badge && (
          <Badge variant="secondary" className="text-xs">
            {badge}
          </Badge>
        )}
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </button>
      {isExpanded && <div className="p-4 pt-0 border-t border-border">{children}</div>}
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <div className="bg-muted/50 border border-border rounded px-3 py-2 font-mono text-xs text-foreground">
      {children}
    </div>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-primary/10 border border-primary/20 rounded-md p-3 flex items-start gap-2">
      <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
      <p className="text-xs text-foreground">{children}</p>
    </div>
  );
}

function WarningBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-warning/10 border border-warning/20 rounded-md p-3 flex items-start gap-2">
      <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
      <p className="text-xs text-foreground">{children}</p>
    </div>
  );
}

function SuccessBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-success/10 border border-success/20 rounded-md p-3 flex items-start gap-2">
      <CheckCircle className="w-4 h-4 text-success mt-0.5 shrink-0" />
      <p className="text-xs text-foreground">{children}</p>
    </div>
  );
}

function TroubleshootItem({ problem, solutions }: { problem: string; solutions: string[] }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-warning" />
        {problem}
      </p>
      <ul className="text-xs text-muted-foreground space-y-1 ml-6">
        {solutions.map((solution, i) => (
          <li key={i}>• {solution}</li>
        ))}
      </ul>
    </div>
  );
}

function BestPracticeItem({
  icon: Icon,
  title,
  tips,
}: {
  icon: any;
  title: string;
  tips: string[];
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground flex items-center gap-2">
        <Icon className="w-4 h-4 text-primary" />
        {title}
      </p>
      <ul className="text-xs text-muted-foreground space-y-1 ml-6">
        {tips.map((tip, i) => (
          <li key={i}>• {tip}</li>
        ))}
      </ul>
    </div>
  );
}

function ExternalLinkItem({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 text-xs text-primary hover:underline"
    >
      <ExternalLink className="w-3 h-3" />
      {label}
    </a>
  );
}
