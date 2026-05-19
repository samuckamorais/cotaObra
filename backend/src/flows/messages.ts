/**
 * Templates de mensagens em português do Brasil — CotaObra (construção).
 *
 * CO-0-09: strings parametrizadas resolvidas em runtime pelo provider
 * Evolution. Sem submissão HSM da Meta. Mantemos retrocompatibilidade
 * com nomes agro (sementes, fertilizantes) durante o fork, mas os exemplos
 * de quantidade já refletem o contexto de construção.
 *
 * Padrão visual:
 * - 👋 apenas em abertura/saudação
 * - ✅ apenas em confirmações de sucesso
 * - 🎉 🤝 apenas em momentos de fechamento/celebração
 * - 😔 em erro com empatia
 * - 📞 em referência a telefone
 * - Opções sempre no formato: 1 — Opção
 * - Cabeçalhos de seção: *bold*
 */

import { normalizeCategoryName } from '../utils/category-normalizer';

/**
 * Exemplo de unidade/quantidade exibido em ASK_QUANTITY conforme a
 * categoria do material. Tolerante a singular/plural e acentuação.
 */
function quantityExampleFor(category?: string): string {
  const c = (category ?? '').toLowerCase().trim();

  // Cimento e cal → sacas de 50kg
  if (c === 'cimento') {
    return '200 sacas, 10 Ton';
  }
  // Agregados → m³, Ton
  if (c === 'agregados' || c === 'areia' || c === 'brita') {
    return '15 m³, 25 Ton';
  }
  // Aço → peças (barras 12m) ou kg
  if (c === 'aco' || c === 'aço' || c === 'vergalhao' || c === 'ferro') {
    return '500 peças, 8 Ton';
  }
  // Blocos / tijolos / lajotas → milheiro ou peças
  if (c === 'blocos' || c === 'tijolo' || c === 'tijolos') {
    return '5 milheiros, 8000 peças';
  }
  // Concreto e argamassa → m³ / sacas
  if (c === 'concreto' || c === 'argamassa') {
    return '30 m³, 100 sacas';
  }
  // Hidráulica / Elétrica → peças / rolos
  if (c === 'hidraulica' || c === 'hidráulica' || c === 'eletrica' || c === 'elétrica') {
    return '50 peças, 10 rolos';
  }
  // Gesso e drywall → placas (peças) / sacas
  if (c === 'gesso' || c === 'drywall') {
    return '120 peças, 40 sacas';
  }
  // Revestimento → m²
  if (c === 'revestimento' || c === 'porcelanato' || c === 'ceramica' || c === 'cerâmica') {
    return '180 m²';
  }
  // Pintura → baldes / litros
  if (c === 'pintura' || c === 'tinta' || c === 'tintas') {
    return '20 baldes, 360 litros';
  }
  // Cobertura → m² (telhas)
  if (c === 'cobertura' || c === 'telha' || c === 'telhas') {
    return '120 m², 800 peças';
  }
  // Esquadrias / vidraçaria → peças
  if (c === 'esquadrias' || c === 'porta' || c === 'janela' || c === 'vidracaria' || c === 'vidraçaria') {
    return '40 peças';
  }
  // Ferramentas / EPIs → unidades / caixas
  if (c === 'ferramentas' || c === 'epi') {
    return '50 un, 10 caixas';
  }
  // Madeira → m³ / peças
  if (c === 'madeira' || c === 'tapume') {
    return '20 m³, 100 peças';
  }

  // ----- Backward compat agro (será removido após Sprint 2) -----
  if (c === 'semente' || c === 'sementes') return '10 Big Bags';
  if (c === 'fertilizante' || c === 'fertilizantes') return '50 Ton, 30 Big Bags, 60.000 kg, 100 litros';
  if (c === 'foliar' || c === 'defensivo' || c === 'defensivos') return '500 kg, 20 litros, 10 Ton';
  if (c === 'combustível' || c === 'combustivel') return '3000 lts';
  if (c === 'frete') return '400 km';
  if (c === 'implementos') return '10 un, 5 caixas';

  // Fallback default
  return '100 sacas, 500 kg, 20 litros';
}

export const Messages = {
  // ===================================
  // MENSAGENS DO SOLICITANTE (engenheiro/comprador da construtora)
  // ===================================

  WELCOME: (producerName?: string, isReturning = false) => {
    const name = producerName ? ` ${producerName}` : '';

    if (isReturning) {
      return `Olá${name}! 👋 O que vamos cotar hoje?

1 — Nova cotação
2 — Adicionar fornecedor`;
    }

    return `Olá${name}! 👋 Seja bem-vindo ao *CotaObra*.

Sou seu assistente de cotações de *materiais de construção* — você me descreve o que precisa pra obra e eu envio para seus fornecedores, organizando as propostas e o comparativo lado a lado pra você.

Por onde quer começar?

1 — Fazer uma cotação
2 — Cadastrar fornecedor
_ajuda_ — Ver como funciona`;
  },

  ASK_QUOTE_MODE: `Sua cotação tem *mais de 1 produto*?

1 — Sim, são vários produtos
2 — Não, é apenas 1 produto`,

  QUOTE_FORM_LINK: (url: string) =>
    `Como sua cotação tem vários produtos, preparei um formulário para você preencher tudo de uma vez.\n\n${url}\n\n_Válido por 2 horas._ Após enviar, eu disparo para os fornecedores e te aviso aqui pelo WhatsApp.`,

  START_QUOTE: `Certo! Vamos criar sua cotação.`,

  ASK_CATEGORY: (categories: string[]) => {
    if (categories.length === 0) {
      return `Qual a *categoria* do material?\n\nEx: cimento, agregados, aço, hidráulica, elétrica`;
    }

    let message = `Qual a categoria do material?\n\n`;
    categories.forEach((cat, i) => {
      message += `${i + 1} — ${cat}\n`;
    });
    message += `\nResponda com o número ou escreva outra categoria.`;
    return message;
  },

  ASK_PRODUCT: (category: string) => {
    // CO-0-09: contexto construção — pedimos o "material" (item específico).
    return `Categoria: *${category}*\n\nQual material você quer cotar?`;
  },

  ASK_PRODUCT_DEFENSIVO: (category: string) =>
    // CO-0-09: na construção, perguntamos a *especificação técnica* (norma, marca, espessura).
    `Categoria: *${category}*\n\nQual o *nome do material*?\n\nEx: Cimento CP-II-Z 32, Brita 1, Vergalhão CA-50 12,5mm, Tijolo cerâmico 9x19x19cm`,

  ASK_ACTIVE_PRINCIPLE: (product: string) =>
    // CO-0-09: equivalente construção é a *especificação técnica* (norma NBR, marca).
    `Material: *${product}*\n\nTem alguma *especificação técnica* obrigatória (norma NBR, marca aprovada pelo arquiteto)?\n\nEx: NBR 7480, marca Votorantim, cor branca\n\nSe não tiver, responda *não*.`,

  ASK_MORE_ITEMS: (items: Array<{ product: string; quantity: number; unit: string; activeIngredient?: string }>) => {
    const list = items.map((it, i) => {
      let line = `  ${i + 1}. ${it.product}`;
      if (it.activeIngredient) line += ` (PA: ${it.activeIngredient})`;
      line += ` — ${it.quantity} ${it.unit}`;
      return line;
    }).join('\n');
    return `Itens até agora:\n${list}\n\nQuer adicionar mais um item?\n\n1 — Sim, adicionar\n2 — Não, continuar`;
  },

  ASK_QUANTITY: (product: string, category?: string) => {
    const example = quantityExampleFor(category);
    return `Qual a quantidade de *${product}*?\n\nEx: ${example}`;
  },

  ASK_REGION: () =>
    `Qual a cidade ou região de entrega?\n\nEx: São Paulo (capital), Campinas, ABC paulista`,

  ASK_DEADLINE: () =>
    `Qual o prazo máximo para entrega na obra?\n\nEx: amanhã, em 5 dias, 30/06`,

  ASK_OBSERVATIONS_OPTIONAL: () =>
    `Tem alguma observação para os fornecedores? (acesso, horário, descarga)\n\nSe não tiver, responda *não*.`,

  ASK_FREIGHT: `O frete é CIF ou FOB?

1 — *CIF* — fornecedor entrega na obra
2 — *FOB* — você retira no fornecedor`,

  ASK_PAYMENT_TERMS: (freight: string) =>
    // CO-0-09: condições típicas de construção: à vista (~5% desc), 28dd, 28/56dd, 30/60/90dd.
    `Frete: *${freight === 'CIF' ? 'CIF (entrega na obra)' : 'FOB (retira no fornecedor)'}*\n\nQual a condição de pagamento?\n\nEx: à vista, 28dd, 28/56dd, 30/60/90dd`,

  ASK_SUPPLIER_SCOPE: `*Para quais fornecedores enviar?*

1 — Meus fornecedores
2 — Rede CotaObra
3 — Todos`,

  CONFIRM_QUOTE: (summary: {
    category?: string;
    items: Array<{ product: string; quantity: number; unit: string; activeIngredient?: string }>;
    region: string;
    deadline: string;
    observations?: string;
    freight?: string;
    quotePaymentTerms?: string;
    scope: string;
  }) => {
    const itemsText = summary.items
      .map((it, i) => {
        let line = `  ${i + 1}. ${it.product}`;
        if (it.activeIngredient) line += ` (PA: ${it.activeIngredient})`;
        line += ` — ${it.quantity} ${it.unit}`;
        return line;
      })
      .join('\n');

    let msg = `*Resumo da cotação:*\n\n`;
    if (summary.category) msg += `Categoria: ${summary.category}\n`;
    msg += `Produtos:\n${itemsText}\n`;
    msg += `Região: ${summary.region}\n`;
    msg += `Prazo: ${summary.deadline}\n`;
    if (summary.freight) msg += `Frete: ${summary.freight === 'CIF' ? 'CIF (entrega inclusa)' : 'FOB (retira)'}\n`;
    if (summary.quotePaymentTerms) msg += `Pagamento: ${summary.quotePaymentTerms}\n`;
    if (summary.observations) msg += `Obs: ${summary.observations}\n`;
    msg += `Fornecedores: ${summary.scope}\n`;
    msg += `\nConfirma?\n\n*sim* — enviar\n*corrigir* — recomeçar`;
    return msg;
  },

  QUOTE_DISPATCHED: (suppliersCount: number) =>
    `Cotação enviada para *${suppliersCount} fornecedor(es)*. ✅\n\nVocê receberá um resumo das propostas assim que elas chegarem.`,

  QUOTE_SUMMARY: (proposals: Array<{
    rank: number;
    supplierName: string;
    isOwn: boolean;
    totalPrice: number;
    deliveryDays: number;
    paymentTerms: string;
    observations?: string;
    rating?: number;
    isPartial?: boolean;
    coveredItems?: number;
    totalItems?: number;
  }>) => {
    let message = `*Propostas recebidas* (ranking por preço, avaliação e prazo):\n\n`;

    proposals.forEach((p) => {
      const badge = p.isOwn ? 'seu fornecedor' : 'rede CotaObra';
      const partialTag = p.isPartial && p.coveredItems != null && p.totalItems != null
        ? ` [parcial ${p.coveredItems}/${p.totalItems}]`
        : '';
      const ratingStr = p.rating != null && p.rating > 0
        ? ` · ${'★'.repeat(Math.round(p.rating))}${'☆'.repeat(5 - Math.round(p.rating))}`
        : '';
      message += `*${p.rank}. ${p.supplierName}* (${badge})${partialTag}\n`;
      message += `   R$ ${p.totalPrice.toFixed(2)}`;
      message += ` · ${p.deliveryDays} dias`;
      message += ` · ${p.paymentTerms}`;
      message += `${ratingStr}\n`;
      if (p.observations) message += `   Obs: ${p.observations}\n`;
      message += `\n`;
    });

    message += `Responda com o *número* para escolher o fornecedor\nou *cancelar* para encerrar sem escolher.`;
    return message;
  },

  QUOTE_CLOSED: (supplierName: string) =>
    `Fechado com *${supplierName}*! 🎉\n\nO fornecedor já foi notificado. Boa negociação! 🤝`,

  QUOTE_CANCELLED: `Cotação cancelada.\n\nQuando quiser, é só mandar "nova cotação".`,

  QUOTA_EXCEEDED: (limit: number) =>
    `Você atingiu o limite de *${limit} cotações* do seu plano este mês.\n\nEntre em contato para fazer upgrade.`,

  // ===================================
  // CADASTRO DE FORNECEDOR
  // ===================================

  ADD_SUPPLIER_INSTRUCTIONS: `Para cadastrar um fornecedor, *compartilhe o contato* dele pelo WhatsApp:

1. Toque no clipe (📎)
2. Selecione "Contato"
3. Escolha o fornecedor e envie

Ou, se preferir, digita assim:
*Nome:* João Silva
*Telefone:* 64999999999`,

  SUPPLIER_ADDED_SUCCESS: (supplierName: string) =>
    `*${supplierName}* foi cadastrado! ✅\n\nEle já pode receber cotações suas.\n\nQuer fazer uma cotação agora? Manda *1*.`,

  ASK_SUPPLIER_CATEGORY: (supplierName: string, categories: string[]) => {
    let message = `*${supplierName}* adicionado!\n\n`;
    message += `Qual é a área de atuação dele?\n\n`;

    if (categories.length > 0) {
      categories.forEach((cat, i) => {
        message += `${i + 1} — ${cat}\n`;
      });
      message += `\nResponda com o(s) número(s) ou escreva a categoria.\nEx: *1* ou *1,3*`;
    } else {
      message += `Ex: cimento, agregados, aço, hidráulica, elétrica`;
    }

    return message;
  },

  SUPPLIER_CATEGORY_SAVED: (supplierName: string, categories: string[]) =>
    `Pronto! *${supplierName}* está cadastrado com: ${categories.join(', ')}.\n\nJá pode receber cotações.\n\n1 — Nova cotação\n2 — Cadastrar outro fornecedor`,

  SUPPLIER_ALREADY_EXISTS: (supplierName: string) =>
    `*${supplierName}* já está na sua lista de fornecedores.\n\n1 — Nova cotação\n2 — Cadastrar outro`,

  SUPPLIER_ADD_ERROR: `Não consegui identificar o contato. Tente de novo ou escreva assim:

*Nome:* João Silva
*Telefone:* 64999999999

_cancelar_ — voltar ao menu`,

  // ===================================
  // MENSAGENS DO FORNECEDOR
  // ===================================

  NEW_QUOTE_HOOK: (data: { producerName: string; producerCity?: string; category?: string; items: Array<{ product: string }>; deadline: string; region?: string }) => {
    const productList = data.items.map(i => i.product).join(', ');
    return `Nova cotação de *${data.producerName}*${data.producerCity ? ` (${data.producerCity})` : ''}\n\n` +
      `${data.category ? data.category + ' — ' : ''}${productList}\n` +
      `Entrega: ${data.deadline}${data.region ? ` em ${data.region}` : ''}\n\n` +
      `Tem interesse? Responda para ver detalhes.`;
  },

  NEW_QUOTE_DETAILS: (data: { items: Array<{ product: string; quantity: number; unit: string; activeIngredient?: string }>; freight?: string; paymentTerms?: string; observations?: string; proposalFormUrl?: string; expiresAt?: Date }) => {
    let msg = '*Detalhes da cotação:*\n\nProdutos:\n';
    data.items.forEach((item, i) => {
      msg += `  ${i + 1}. ${item.product} — ${item.quantity} ${item.unit}`;
      if (item.activeIngredient) msg += ` (${item.activeIngredient})`;
      msg += '\n';
    });
    if (data.freight || data.paymentTerms) {
      msg += '\n';
      if (data.freight) msg += `Frete: ${data.freight}`;
      if (data.freight && data.paymentTerms) msg += ' | ';
      if (data.paymentTerms) msg += `Pagamento: ${data.paymentTerms}`;
      msg += '\n';
    }
    if (data.observations) msg += `\nObs: ${data.observations}\n`;
    if (data.expiresAt) {
      const formatted = data.expiresAt.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Sao_Paulo',
      });
      msg += `\n⏰ *Prazo para envio da proposta:* ${formatted}\n`;
    }
    msg += '\n*1* — Enviar proposta\n*2* — Não tenho interesse';
    if (data.proposalFormUrl) msg += `\n\n📋 Ou preencha o formulário:\n${data.proposalFormUrl}`;
    return msg;
  },

  /** @deprecated Use NEW_QUOTE_HOOK + NEW_QUOTE_DETAILS instead */
  NEW_QUOTE_NOTIFICATION: (quote: {
    id: string;
    producerName: string;
    producerCity: string;
    category?: string;
    items?: Array<{ product: string; quantity: number | string; unit: string; activeIngredient?: string }>;
    product?: string;
    quantity?: string;
    unit?: string;
    region: string;
    deadline: string;
    observations?: string;
    freight?: string;
    paymentTerms?: string;
    proposalFormUrl?: string;
  }) => {
    const items = quote.items && quote.items.length > 0
      ? quote.items
      : quote.product
        ? [{ product: quote.product, quantity: quote.quantity || '', unit: quote.unit || '' }]
        : [];

    let message = `Olá! 👋 Sou assistente de cotação da construtora *${quote.producerName}* (${quote.producerCity}).\n\nEstou iniciando a cotação abaixo:\n\n`;

    if (quote.category) message += `Categoria: *${quote.category.charAt(0).toUpperCase() + quote.category.slice(1)}*\n`;
    message += `Materiais:\n`;
    items.forEach((it) => {
      let line = `  • ${it.product}`;
      if (it.activeIngredient) line += ` (PA: ${it.activeIngredient})`;
      line += ` — ${it.quantity} ${it.unit}`;
      message += line + '\n';
    });
    message += `\nDt. de Entrega: ${quote.deadline}\n`;
    message += `Local: ${quote.region.charAt(0).toUpperCase() + quote.region.slice(1)}\n`;
    message += `Frete: ${quote.freight === 'CIF' ? 'CIF (entrega na obra)' : quote.freight === 'FOB' ? 'FOB (retira no fornecedor)' : 'A definir'}\n`;
    if (quote.paymentTerms) message += `Pagamento: ${quote.paymentTerms}\n`;
    if (quote.observations) message += `Obs: ${quote.observations}\n`;

    message += `\nTem interesse em enviar proposta?\n\n`;

    if (quote.proposalFormUrl) {
      message += `Acesse o formulário:\n`;
      message += `${quote.proposalFormUrl}\n\n`;
      message += `2 — Não tenho interesse desta vez`;
    } else {
      message += `1 — Sim, quero participar\n`;
      message += `2 — Não desta vez`;
    }

    return message;
  },

  ASK_PRICE: `Qual o *preço total* da sua proposta?\n\nEx: 15000`,

  ASK_DELIVERY: `Qual o *prazo de entrega* em dias?\n\nEx: 5`,

  // CO-3-03 — condições típicas de construção (1) à vista 2) 28dd 3) 28/56dd 4) 30/60/90dd 5) outro.
  ASK_PAYMENT: `Qual a *condição de pagamento*?

1 — *À vista* (5% desc. comum)
2 — *28 dias*
3 — *28/56 dias*
4 — *30/60/90 dias*
5 — *Outro* (digite no formato livre)`,

  /**
   * CO-3-03 — Resolve a escolha numérica do fornecedor em um label canônico.
   * Aceita também texto livre como fallback.
   */
  RESOLVE_PAYMENT_CHOICE: (input: string): string | null => {
    const v = input.trim();
    if (v === '1') return 'à vista';
    if (v === '2') return '28dd';
    if (v === '3') return '28/56dd';
    if (v === '4') return '30/60/90dd';
    // 5 ou texto livre → próximo passo deve perguntar de novo OU usar como livre
    if (v === '5') return null; // sinaliza que precisa de texto livre
    // Fallback: aceita texto livre direto (>= 3 chars)
    if (v.length >= 3) return v;
    return null;
  },

  ASK_SUPPLIER_OBS: `Alguma observação sobre sua proposta?\n\nSe não tiver, responda *não*.`,

  PROPOSAL_SENT: `Proposta registrada! ✅\n\nA construtora vai receber junto com as demais. Você será avisado se for selecionado.`,

  PROPOSAL_SENT_WITH_RANKING: (data: {
    totalProposals: number;
    yourPrice: number;
    expiresIn: string;
  }) =>
    `Proposta enviada! ✅\n\nSua proposta: *R$ ${data.yourPrice.toFixed(2)}*\nTotal recebidas: ${data.totalProposals}\nCotação encerra em: ${data.expiresIn}\n\nVocê será avisado quando a construtora decidir.`,

  PROPOSAL_NOT_SELECTED: (data: {
    winningPrice: number;
    yourPrice: number;
    producerName: string;
  }) => {
    const diff = data.yourPrice - data.winningPrice;
    const diffPercent = ((diff / data.winningPrice) * 100).toFixed(1);

    let message = `A cotação da construtora *${data.producerName}* foi encerrada.\n\n`;
    message += `Desta vez outro fornecedor foi escolhido.\n\n`;
    message += `Vencedor: R$ ${data.winningPrice.toFixed(2)}\n`;
    message += `Sua proposta: R$ ${data.yourPrice.toFixed(2)} (+${diffPercent}%)\n\n`;

    if (diff <= data.winningPrice * 0.05) {
      message += `Você ficou muito próximo! Continue assim.`;
    } else {
      message += `Na próxima, uma proposta mais competitiva pode fazer a diferença.`;
    }

    return message;
  },

  PROPOSAL_SELECTED: (data: { producerName: string; producerPhone: string }) =>
    `Parabéns! 🎉 A construtora *${data.producerName}* escolheu você.\n\nEntre em contato para fechar os detalhes:\n📞 ${data.producerPhone}\n\nBoa negociação! 🤝`,

  QUOTE_CLOSED_PRODUCER_CONTACTS: (producerName: string) =>
    `A cotação foi encerrada. A construtora *${producerName}* entrará em contato!`,

  QUOTE_EXPIRED_SUPPLIER: (productName: string) =>
    `Olá! A cotação de *${productName}* foi encerrada.\n\nO prazo para recebimento de propostas expirou. Até a próxima! 👋`,

  PROPOSAL_WON_DETAILED: (data: {
    product: string;
    producerName: string;
  }) =>
    `Parabéns! 🎉 Você foi selecionado para *${data.product}*. A construtora *${data.producerName}* entrará em contato.`,

  PROPOSAL_LOST_DETAILED: (data: {
    position: number;
    yourPrice: number;
    winnerPrice: number;
    diffPercent: number;
  }) => {
    let message = `Sua proposta ficou em *${data.position}º lugar*.\n\n`;
    message += `Seu preço: R$ ${data.yourPrice.toFixed(2)}\n`;
    message += `Vencedor: R$ ${data.winnerPrice.toFixed(2)} (-${data.diffPercent.toFixed(1)}%)\n\n`;
    message += `Para melhorar: seu preço estava ${data.diffPercent.toFixed(1)}% acima.`;
    return message;
  },

  PROPOSAL_DECLINED: `Sem problemas, obrigado pelo retorno!`,

  // ===================================
  // REPETIR ÚLTIMA COTAÇÃO
  // ===================================

  REPEAT_LAST_QUOTE: (last: {
    product?: string;
    quantity?: string;
    unit?: string;
    category?: string;
    items?: Array<{ product: string; quantity: number; unit: string }>;
    region: string;
    deadline?: string;
  }) => {
    let productLine = '';
    if (last.items && last.items.length > 0) {
      if (last.items.length === 1) {
        const it = last.items[0];
        productLine = `${it.product} — ${it.quantity} ${it.unit}`;
      } else {
        productLine = `${last.items.length} produtos (${last.items.map((it) => it.product).join(', ')})`;
      }
    } else if (last.product) {
      productLine = `${last.product} — ${last.quantity} ${last.unit}`;
    }
    // Defensivo: normalizar categoria de cotações antigas (pré-normalização)
    const displayCategory = normalizeCategoryName(last.category);
    const categoryLine = displayCategory ? `Categoria: ${displayCategory}\n` : '';
    return `Quer repetir sua última cotação?\n\n${categoryLine}Produto: ${productLine}\nRegião: ${last.region}\n\n1 — Sim, repetir\n2 — Nova cotação`;
  },

  // ===================================
  // VALIDAÇÃO DE CONTEXTO FSM
  // ===================================

  CONTEXT_MISSING_PRODUCT: 'Preciso saber o produto antes de continuar. Qual produto você precisa cotar?',
  CONTEXT_MISSING_ITEMS: 'Preciso dos itens da cotação antes de continuar.',
  CONTEXT_MISSING_REGION: 'Preciso saber a região de entrega. Qual a cidade/região?',
  CONTEXT_MISSING_DEADLINE: 'Preciso saber o prazo de entrega. Até quando precisa receber?',

  // ===================================
  // MENSAGENS GENÉRICAS
  // ===================================

  // ===================================
  // SMART FILL (FEAT-007 / FF-BE-013) — copy refinado pelo PO Sênior
  // ===================================

  /**
   * Resumo unificado quando o smart fill captou dados suficientes
   * para confirmação direta. Confidence média/baixa marca campos
   * como ⚠️ ; warns/erros do validator semântico aparecem em bloco
   * separado.
   */
  SMART_FILL_SUMMARY: (data: {
    productLine?: string;        // ex: "SSP 20% • 60 Ton • Fertilizante"
    regionLine?: string;         // ex: "Rio Verde - GO • prazo 30/08"
    commercialLine?: string;     // ex: "CIF • à vista"
    suppliersLine?: string;      // ex: "8 fornecedores"
    warnings?: string[];         // mensagens dos issues 'warn' do validator
    defaultsLine?: string;       // ex: "Frete e pagamento: padrão anterior"
  }) => {
    let msg = '';
    if (data.productLine)   msg += `✅ ${data.productLine}\n`;
    if (data.regionLine)    msg += `📍 ${data.regionLine}\n`;
    if (data.commercialLine) msg += `🚚 ${data.commercialLine}\n`;
    if (data.suppliersLine) msg += `👥 ${data.suppliersLine}\n`;
    if (data.defaultsLine)  msg += `\n_${data.defaultsLine}_\n`;
    if (data.warnings && data.warnings.length > 0) {
      msg += '\n';
      for (const w of data.warnings) {
        msg += `⚠️ ${w}\n`;
      }
    }
    msg += `\nConfirma? Responda *sim* ou edite (ex: "frete FOB")`;
    return msg;
  },

  /**
   * Pergunta agrupada quando faltam 2+ campos. Usa templates curados
   * top-10 entregues pelo PO em FEAT-007-Refinamento §4.3.
   */
  SMART_FILL_GROUPED_QUESTION: (params: {
    missingLabels: string[];     // ex: ['quantidade', 'região', 'prazo']
    example: string;             // ex: "60 ton, Rio Verde, 30/08"
  }) => {
    const list = params.missingLabels.join(', ');
    return `Faltam ${params.missingLabels.length} dados pra fechar:\n${list}\n\nPode mandar tudo junto. Ex:\n_${params.example}_`;
  },

  /**
   * Welcome reformulado para descoberta do smart fill — FF-BE-019.
   */
  SMART_FILL_WELCOME: (producerName?: string) => {
    const name = producerName ? ` ${producerName}` : '';
    return `Olá${name}! 👋

Pra cotar rápido, manda os dados numa mensagem só.
Ex: _SSP 20% 60 ton, Rio Verde, CIF, 30/08_

Ou digite *1* pra eu te guiar passo a passo.`;
  },

  /**
   * Nudge pós-cotação sequencial — FF-BE-019.
   * Aparece após cotação concluída via fluxo guiado, ensinando
   * o caminho rápido para a próxima vez.
   */
  SMART_FILL_NUDGE: () =>
    `💡 Dica: da próxima, você pode mandar tudo junto.\nEx: _SSP 20% 60 ton, Rio Verde, CIF, 30/08_`,

  /** @deprecated mantido por compatibilidade — use SMART_FILL_SUMMARY */
  SMART_FILL_CONFIRMATION: (fields: Record<string, string>, missing: string[]) => {
    let msg = 'Entendi! Veja o que captei:\n\n';
    for (const [key, value] of Object.entries(fields)) {
      const labels: Record<string, string> = {
        category: 'Categoria', product: 'Produto', quantity: 'Quantidade',
        region: 'Região', deadline: 'Prazo', freight: 'Frete',
        paymentTerms: 'Pagamento',
      };
      msg += `  ✅ ${labels[key] || key}: ${value}\n`;
    }
    if (missing.length > 0) {
      const missingLabels: Record<string, string> = {
        category: 'categoria', product: 'produto', quantity: 'quantidade',
        region: 'região de entrega', deadline: 'prazo', freight: 'tipo de frete (CIF/FOB)',
        paymentTerms: 'condição de pagamento', supplierScope: 'escopo de fornecedores',
      };
      const nextMissing = missingLabels[missing[0]] || missing[0];
      msg += `\nFalta definir: *${nextMissing}*`;
    } else {
      msg += '\nTudo certo! Confirma? *1* = Sim | *2* = Corrigir';
    }
    return msg;
  },

  CONTEXT_RECOVERY: (context: any, minutesAgo: number) => {
    let msg = `Olá! Você estava criando uma cotação ${minutesAgo} minutos atrás.\n\n`;
    msg += 'Até agora:\n';
    if (context.items?.[0]?.product) msg += `  Produto: ${context.items[0].product}\n`;
    if (context.region) msg += `  Região: ${context.region}\n`;
    if (context.deadline) msg += `  Prazo: ${context.deadline}\n`;
    msg += '\n*1* — Continuar de onde parei\n*2* — Começar nova cotação';
    return msg;
  },

  UNKNOWN_INPUT: `Não entendi.\n\nDigite *ajuda* para ver o que posso fazer.`,

  HELP: `*CotaObra — Ajuda*

*O que você pode fazer:*
• *nova cotação* — Solicitar cotação de materiais
• *fornecedor* — Cadastrar um fornecedor
• *status* — Ver andamento de cotação ativa
• *cancelar* — Cancelar o que está fazendo
• *ajuda* — Ver esta mensagem

*Como funciona:*
1. Você descreve o que precisa
2. Envio para seus fornecedores
3. Você recebe as propostas aqui
4. Escolhe a melhor

Dúvidas? Fale com o suporte.`,

  // ===================================
  // CONSULTA DE STATUS DE COTAÇÃO
  // ===================================

  QUOTE_STATUS_PROGRESS: (data: {
    summary: string;
    respondedCount: number;
    totalSuppliers: number;
    expiresAt: Date;
  }) => {
    const formatted = data.expiresAt.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });

    const remainingMs = data.expiresAt.getTime() - Date.now();
    let remainingText = '';
    if (remainingMs > 0) {
      const totalMin = Math.floor(remainingMs / 60000);
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      if (h > 0) remainingText = ` (faltam ${h}h ${String(m).padStart(2, '0')}min)`;
      else remainingText = ` (faltam ${m}min)`;
    }

    let intro: string;
    if (data.totalSuppliers === 0) {
      intro = `👥 Nenhum fornecedor notificado ainda`;
    } else if (data.respondedCount === 0) {
      intro = `👥 *0 de ${data.totalSuppliers}* fornecedores responderam — aguardando as primeiras propostas`;
    } else {
      intro = `👥 *${data.respondedCount} de ${data.totalSuppliers}* fornecedores já enviaram proposta`;
    }

    return `*Andamento da sua cotação*

📦 ${data.summary}
${intro}
⏰ Encerra em: ${formatted}${remainingText}

Você receberá o comparativo completo automaticamente quando a cotação for consolidada.`;
  },

  NO_ACTIVE_QUOTE: `Você não tem cotação em andamento no momento.

Quer fazer uma nova? Manda *1*.`,

  MULTIPLE_ACTIVE_QUOTES: (
    quotes: Array<{
      summary: string;
      respondedCount: number;
      totalSuppliers: number;
      expiresAt: Date;
    }>,
  ) => {
    let msg = `Você tem *${quotes.length} cotações* em andamento:\n\n`;
    quotes.forEach((q, i) => {
      const formatted = q.expiresAt.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Sao_Paulo',
      });
      msg += `*${i + 1}.* ${q.summary} — ${q.respondedCount} de ${q.totalSuppliers} responderam · encerra ${formatted}\n`;
    });
    msg += `\nResponda com o número para ver o andamento detalhado.`;
    return msg;
  },

  STATUS_CHECK_RATE_LIMITED: `Você consultou o status várias vezes recentemente. Vou te avisar automaticamente assim que tiver novidade.`,

  STATUS_CHECK_BUSY: (currentTask: string) =>
    `Antes vamos terminar ${currentTask}. Para ver o status de outras cotações, digite *cancelar* primeiro.`,

  ERROR: `Algo deu errado por aqui. 😔\n\nTente novamente em instantes.`,

  ERROR_WITH_SUGGESTIONS: (userInput: string, suggestions: string[]) => {
    let message = `Não entendi "${userInput}".\n\n`;

    if (suggestions.length > 0) {
      message += `Você quis dizer:\n`;
      suggestions.forEach((suggestion, index) => {
        message += `${index + 1} — ${suggestion}\n`;
      });
      message += `\n`;
    }

    message += `Ou tente digitar novamente.`;
    return message;
  },

  // FEAT-PDF-001 — Fallback quando o envio do PDF de resultado falha
  // (após todos os retries). Cliente recebe link para abrir no painel.
  // O dashboardUrl deve ser construído pelo caller com FRONTEND_URL (§14.3).
  PDF_DELIVERY_FAILED: (dashboardUrl: string) =>
    'Não conseguimos enviar o PDF da sua cotação por aqui no momento. ' +
    'Você pode visualizar o resultado completo no painel:\n' +
    dashboardUrl,
};
