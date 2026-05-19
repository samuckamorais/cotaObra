import OpenAI from 'openai';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { NLUResult } from '../types';

/**
 * Serviço de integração com OpenAI para interpretação de linguagem natural (NLU)
 * Usa GPT-4o para extrair intenções e entidades de mensagens do WhatsApp
 */
export class OpenAIService {
  private client: OpenAI | null = null;

  constructor() {
    if (env.OPENAI_API_KEY) {
      this.client = new OpenAI({
        apiKey: env.OPENAI_API_KEY,
      });
    } else {
      logger.warn('OpenAI API key not configured. Using fallback regex-based NLU.');
    }
  }

  /**
   * Transcreve áudio usando Whisper API
   */
  async transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<string> {
    if (!this.client) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      // Converter buffer para File-like object
      const file = new File([audioBuffer], 'audio.ogg', { type: mimeType });

      const response = await this.client.audio.transcriptions.create(
        {
          file,
          model: 'whisper-1',
          language: 'pt', // Português brasileiro
          response_format: 'text',
        },
        {
          timeout: 15000, // 15s timeout para processar áudio
        }
      );

      logger.info('Audio transcribed successfully', {
        length: audioBuffer.length,
        transcriptionLength: response.length,
      });

      return response;
    } catch (error) {
      logger.error('Failed to transcribe audio', { error });
      throw new Error('Não consegui entender o áudio. Tente novamente ou digite sua mensagem.');
    }
  }

  /**
   * Analisa imagem de nota fiscal usando GPT-4 Vision
   */
  async analyzeInvoiceImage(
    imageBuffer: Buffer
  ): Promise<{
    product?: string;
    quantity?: string;
    unit?: string;
    price?: number;
    supplier?: string;
  }> {
    if (!this.client) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      // Converter imagem para base64
      const base64Image = imageBuffer.toString('base64');

      const response = await this.client.chat.completions.create(
        {
          model: 'gpt-4-vision-preview',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `Analise esta nota fiscal ou recibo de compra de insumos agrícolas e extraia as seguintes informações:
- Produto (nome completo do item)
- Quantidade (número)
- Unidade (sacos, kg, litros, etc)
- Preço unitário (em R$)
- Fornecedor/Empresa

Retorne APENAS um JSON com os campos: product, quantity, unit, price, supplier.
Se não conseguir identificar algum campo, deixe como null.`,
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/jpeg;base64,${base64Image}`,
                  },
                },
              ],
            },
          ],
          max_tokens: 500,
          temperature: 0.2,
        },
        {
          timeout: 20000, // 20s timeout para processar imagem
        }
      );

      const content = response.choices[0]?.message?.content || '{}';

      // Parse do JSON
      const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const extracted = JSON.parse(cleaned);

      logger.info('Image analyzed successfully', { extracted });

      return {
        product: extracted.product || undefined,
        quantity: extracted.quantity ? String(extracted.quantity) : undefined,
        unit: extracted.unit || undefined,
        price: extracted.price ? parseFloat(String(extracted.price)) : undefined,
        supplier: extracted.supplier || undefined,
      };
    } catch (error) {
      logger.error('Failed to analyze image', { error });
      throw new Error('Não consegui analisar a imagem. Tente fotografar novamente com melhor iluminação.');
    }
  }

  /**
   * Sugere correções para entrada inválida usando GPT-4
   */
  async suggestCorrections(
    userInput: string,
    expectedType: 'product' | 'quantity' | 'region' | 'deadline',
    context?: string
  ): Promise<string[]> {
    // Se OpenAI não estiver configurada, retornar array vazio
    if (!this.client) {
      return [];
    }

    try {
      const systemPrompt = `Você é um assistente que sugere correções para entradas de usuários em um sistema de cotação agrícola.
O usuário digitou algo que não foi compreendido. Sugira até 3 correções plausíveis.

Tipo de entrada esperada: ${expectedType}
${context ? `Contexto: ${context}` : ''}

Para produtos: sugira insumos agrícolas comuns (ração, soja, milho, fertilizante, defensivo)
Para quantidade: sugira formatos corretos (100 sacas, 500 kg)
Para região: sugira cidades/regiões do Brasil
Para prazo: sugira formatos corretos (amanhã, em 5 dias, 30/03/2024)

Retorne APENAS um array JSON com 3 sugestões de string, sem texto adicional.
Exemplo: ["Ração para gado", "Ração para aves", "Fertilizante NPK"]`;

      const response = await this.client.chat.completions.create(
        {
          model: 'gpt-4',
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: `O usuário digitou: "${userInput}". Sugira 3 correções.`,
            },
          ],
          temperature: 0.7,
          max_tokens: 150,
        },
        {
          timeout: 3000, // 3s timeout para não aumentar latência
        }
      );

      const content = response.choices[0]?.message?.content || '[]';

      // Parse do JSON
      const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const suggestions = JSON.parse(cleaned);

      return Array.isArray(suggestions) ? suggestions.slice(0, 3) : [];
    } catch (error) {
      logger.error('Failed to suggest corrections', { error, userInput, expectedType });
      return [];
    }
  }

  /**
   * Interpreta mensagem do usuário e extrai intenção + entidades
   */
  async interpretMessage(message: string, context?: string): Promise<NLUResult> {
    // Se OpenAI não estiver configurada, usa fallback
    if (!this.client) {
      return this.fallbackInterpretation(message);
    }

    try {
      // CO-2-02 — prompt adaptado para o domínio de materiais de construção.
      // Categorias canônicas: cimento, agregados, aco, blocos, concreto, hidraulica,
      // eletrica, gesso, revestimento, pintura, cobertura, esquadrias,
      // impermeabilizacao, vidracaria, ferramentas, madeira, outros.
      // Unidades canônicas: un, pç, caixa, pacote, kg, Ton, m, m², m³, m linear,
      // litros, galão, saca, fardo, rolo, balde, milheiro.
      const systemPrompt = `Você é um assistente especializado em interpretar mensagens de engenheiros e compradores de construtoras brasileiras que precisam cotar MATERIAIS DE CONSTRUÇÃO.

Sua tarefa é analisar a mensagem e retornar um JSON com:
- intent: nova_cotacao | ver_cotacao | cancelar | saudacao | ajuda | responder_cotacao | recusar_cotacao | desconhecido
- entities: { material, quantity, unit, siteHint, deadlineHint, spec }
  * material: nome do material (cimento CP-II, vergalhão CA-50 12.5mm, brita 1, porcelanato 60x60, etc.)
  * quantity: número (apenas valor numérico)
  * unit: unidade normalizada (saca, m³, m², kg, Ton, peça, milheiro, balde, rolo, etc.)
  * siteHint: nome ou trecho do nome da obra mencionada (ex: "Aurora Torre A", "obra do centro")
  * deadlineHint: prazo em linguagem natural ("sexta", "amanhã", "31/12", "fim do mês", "em 3 dias")
  * spec: especificação técnica (NBR, marca aprovada, cor, granulometria) — opcional
- confidence: 0..1

Exemplos:
- "preciso de 200 sacas de cimento CP-II na obra Aurora pra sexta"
  → intent: nova_cotacao, entities: { material: "cimento CP-II", quantity: 200, unit: "saca", siteHint: "Aurora", deadlineHint: "sexta" }
- "30 m³ de areia média, 15 m³ de brita 1, entrega na vila nova amanhã"
  → intent: nova_cotacao, entities: { material: "areia média; brita 1", quantity: null, unit: "m³", siteHint: "vila nova", deadlineHint: "amanhã" }
- "500 vergalhão CA-50 12.5mm, NBR 7480, prazo 5 dias"
  → intent: nova_cotacao, entities: { material: "vergalhão CA-50 12.5mm", quantity: 500, unit: "peça", spec: "NBR 7480", deadlineHint: "em 5 dias" }
- "8 milheiros de tijolo cerâmico 9x19x19"
  → intent: nova_cotacao, entities: { material: "tijolo cerâmico 9x19x19", quantity: 8, unit: "milheiro" }
- "oi, bom dia"
  → intent: saudacao, entities: {}
- "cancelar"
  → intent: cancelar, entities: {}

${context ? `Contexto da conversa: ${context}` : ''}

Retorne APENAS o JSON, sem texto adicional. Quando incerto, omita o campo.`;

      const response = await this.client.chat.completions.create({
        model: env.OPENAI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message.content;
      if (!content) {
        logger.warn('OpenAI returned empty response');
        return this.fallbackInterpretation(message);
      }

      const result = JSON.parse(content) as NLUResult;
      logger.info('OpenAI NLU successful', { message, result });
      return result;
    } catch (error) {
      logger.error('OpenAI NLU error, falling back to regex', { error });
      return this.fallbackInterpretation(message);
    }
  }

  /**
   * Interpretação fallback usando regex simples
   * Usado quando OpenAI não está disponível
   */
  private fallbackInterpretation(message: string): NLUResult {
    const normalized = message.toLowerCase().trim();

    // Saudações
    if (/^(oi|olá|ola|bom dia|boa tarde|boa noite|hey|e aí|eai)/.test(normalized)) {
      return { intent: 'saudacao', entities: {}, confidence: 0.9 };
    }

    // Ajuda
    if (/\b(ajuda|help|socorro|como|tutorial)\b/.test(normalized)) {
      return { intent: 'ajuda', entities: {}, confidence: 0.8 };
    }

    // Cancelar
    if (/^(cancelar|cancela|parar|para|sair)/.test(normalized)) {
      return { intent: 'cancelar', entities: {}, confidence: 0.9 };
    }

    // Ver cotação
    if (/\b(ver|consultar|status|andamento) (cotação|cotacao)\b/.test(normalized)) {
      return { intent: 'ver_cotacao', entities: {}, confidence: 0.7 };
    }

    // Nova cotação (keywords de materiais de construção) — CO-2-02 fallback.
    // Mantém alguns termos agro para retrocompatibilidade durante a transição.
    const productKeywords = [
      // Construção (prioritários)
      'cimento',
      'areia',
      'brita',
      'vergalhão',
      'vergalhao',
      'aço',
      'aco',
      'tijolo',
      'bloco',
      'lajota',
      'concreto',
      'argamassa',
      'cano',
      'tubo',
      'pvc',
      'fio',
      'cabo',
      'eletroduto',
      'gesso',
      'drywall',
      'porcelanato',
      'cerâmica',
      'ceramica',
      'tinta',
      'massa',
      'telha',
      'porta',
      'janela',
      'vidro',
      'epi',
      // Legacy agro (transição)
      'soja',
      'milho',
      'fertilizante',
      'semente',
      'defensivo',
    ];

    const hasProduct = productKeywords.some((keyword) => normalized.includes(keyword));
    const hasCotationKeyword = /\b(cotar|cotação|cotacao|preciso|quero|orçamento)\b/.test(
      normalized
    );

    if (hasProduct || hasCotationKeyword) {
      const entities: NLUResult['entities'] = {};

      // Extrair produto
      for (const keyword of productKeywords) {
        if (normalized.includes(keyword)) {
          entities.product = keyword;
          break;
        }
      }

      // Extrair quantidade (ex: 100 sacos, 500kg, 20 litros)
      const quantityMatch = normalized.match(/(\d+)\s*(sacos?|kg|litros?|toneladas?|ton?|l)/);
      if (quantityMatch) {
        entities.quantity = quantityMatch[1];
        entities.unit = quantityMatch[2];
      }

      // Extrair região (cidades conhecidas)
      const regions = ['goiânia', 'goiania', 'rio verde', 'jataí', 'jatai', 'brasília', 'brasilia'];
      for (const region of regions) {
        if (normalized.includes(region)) {
          entities.region = region;
          break;
        }
      }

      // Extrair deadline
      const deadlineMatch = normalized.match(/em\s+(\d+)\s+dias?|daqui\s+a\s+(\d+)\s+dias?/);
      if (deadlineMatch) {
        const days = deadlineMatch[1] || deadlineMatch[2];
        entities.deadline = `em ${days} dias`;
      }

      return {
        intent: 'nova_cotacao',
        entities,
        confidence: hasProduct && hasCotationKeyword ? 0.8 : 0.6,
      };
    }

    // Desconhecido
    return { intent: 'desconhecido', entities: {}, confidence: 0.5 };
  }

  /**
   * Extrai dados de contato de um texto livre ou vCard malformado usando OpenAI
   */
  async extractContactFromText(text: string): Promise<{ name: string; phone: string; company?: string; email?: string } | null> {
    if (!this.client) return null;

    try {
      const response = await this.client.chat.completions.create({
        model: env.OPENAI_MODEL,
        messages: [
          {
            role: 'system',
            content: `Extraia dados de contato do texto abaixo e retorne APENAS um JSON com os campos: name, phone, company (opcional), email (opcional).
O campo phone deve estar no formato +5564999999999. Se não encontrar nome ou telefone, retorne null.
Retorne SOMENTE o JSON, sem explicações.`,
          },
          { role: 'user', content: text },
        ],
        temperature: 0,
        max_tokens: 150,
      });

      const content = response.choices[0]?.message?.content?.trim() || '';
      const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      if (cleaned === 'null') return null;
      return JSON.parse(cleaned);
    } catch (error) {
      logger.error('extractContactFromText failed', { error });
      return null;
    }
  }

  /**
   * FF-BE-010 — Extração multi-slot estruturada com confiança.
   *
   * Usa Structured Outputs (response_format json_schema) do
   * gpt-4o-2024-08-06 — modelo pinado evita regressão silenciosa
   * quando a OpenAI faz update.
   *
   * Retorna `null` quando OpenAI não está configurada, timeout, rate
   * limit ou JSON inválido — caller deve aplicar fallback regex.
   * Não propaga erro. Timeout 4s para não estourar p95 do webhook.
   */
  async extractStructuredQuoteFields(message: string): Promise<{
    fields: Record<string, { value: any; confidence: number; unit?: string; needsDisambiguation?: boolean }>;
    modelVersion: string;
  } | null> {
    if (!this.client) return null;

    const systemPrompt = `Você é um extrator de entidades para cotações agrícolas no WhatsApp.
Extraia APENAS o que estiver explícito na mensagem do produtor brasileiro. NÃO invente.

Cada campo deve ter um score de confidence entre 0.0 e 1.0:
- 0.95+ : valor literal e inequívoco
- 0.85-0.94 : valor explícito mas com pequena ambiguidade (ex: abreviação comum)
- 0.50-0.84 : valor implícito ou abreviado
- < 0.50 : sinal fraco — prefira NÃO retornar

Para o campo region, marque needsDisambiguation=true se o nome corresponder a múltiplas UFs (ex: "Rio Verde" → GO, MT, RJ).

Para deadline, retorne ISO YYYY-MM-DD quando possível. Se vago ("amanhã", "30/08"), retorne string original.

Para quantity, sempre retorne value numérico e unit em label canônico:
"Ton" | "kg" | "litros" | "sacas" | "Big Bags" | "Unidades" | "Caixas" | "km" | "ha".

Para freight, retorne literal "CIF" ou "FOB".

Para observation, só retorne se tiver prefixo explícito "obs:" ou "observação:".`;

    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        product: {
          type: ['object', 'null'],
          additionalProperties: false,
          properties: {
            value: { type: 'string' },
            confidence: { type: 'number' },
          },
          required: ['value', 'confidence'],
        },
        quantity: {
          type: ['object', 'null'],
          additionalProperties: false,
          properties: {
            value: { type: 'number' },
            unit: { type: 'string' },
            confidence: { type: 'number' },
          },
          required: ['value', 'unit', 'confidence'],
        },
        region: {
          type: ['object', 'null'],
          additionalProperties: false,
          properties: {
            value: { type: 'string' },
            confidence: { type: 'number' },
            needsDisambiguation: { type: 'boolean' },
          },
          required: ['value', 'confidence', 'needsDisambiguation'],
        },
        deadline: {
          type: ['object', 'null'],
          additionalProperties: false,
          properties: {
            value: { type: 'string' },
            confidence: { type: 'number' },
          },
          required: ['value', 'confidence'],
        },
        freight: {
          type: ['object', 'null'],
          additionalProperties: false,
          properties: {
            value: { type: 'string' },
            confidence: { type: 'number' },
          },
          required: ['value', 'confidence'],
        },
        payment: {
          type: ['object', 'null'],
          additionalProperties: false,
          properties: {
            value: { type: 'string' },
            confidence: { type: 'number' },
          },
          required: ['value', 'confidence'],
        },
        category: {
          type: ['object', 'null'],
          additionalProperties: false,
          properties: {
            value: { type: 'string' },
            confidence: { type: 'number' },
          },
          required: ['value', 'confidence'],
        },
        observation: {
          type: ['object', 'null'],
          additionalProperties: false,
          properties: {
            value: { type: 'string' },
            confidence: { type: 'number' },
          },
          required: ['value', 'confidence'],
        },
      },
      required: [
        'product',
        'quantity',
        'region',
        'deadline',
        'freight',
        'payment',
        'category',
        'observation',
      ],
    };

    try {
      const response = await this.client.chat.completions.create(
        {
          model: 'gpt-4o-2024-08-06',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'quote_extraction',
              strict: true,
              schema,
            },
          },
          temperature: 0.1,
          max_tokens: 500,
        },
        { timeout: 4000 },
      );

      const content = response.choices[0]?.message?.content?.trim();
      if (!content) return null;

      const parsed = JSON.parse(content) as Record<string, any>;
      const fields: Record<string, any> = {};
      for (const key of Object.keys(parsed)) {
        const v = parsed[key];
        if (v && typeof v === 'object' && 'value' in v && 'confidence' in v) {
          fields[key] = v;
        }
      }
      return {
        fields,
        modelVersion: 'gpt-4o-2024-08-06',
      };
    } catch (error: any) {
      // Pode ser 404 (modelo indisponível na conta), 429 (rate limit),
      // timeout — todos cai pro regex fallback do caller.
      logger.warn('extractStructuredQuoteFields failed — falling back', {
        message: error?.message,
        code: error?.code,
        status: error?.status,
      });
      return null;
    }
  }
}

// Singleton
export const openaiService = new OpenAIService();
