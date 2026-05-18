import { WhatsAppFactory } from './whatsapp.factory';
import { IWhatsAppProvider } from './interfaces/whatsapp-provider.interface';
import {
  IncomingMessage,
  OutgoingMessage,
  OutgoingDocumentMessage,
} from '../../types';
import { logger } from '../../utils/logger';
import { openaiService } from '../../services/openai.service';
import { prisma } from '../../config/database';
// CO-0-06: arquivo renomeado para requester.flow.ts. Nome da classe `ProducerFSM`
// preservado no Sprint 0; rename do símbolo vem na Sprint 2 (adaptação real da FSM).
import { ProducerFSM } from '../../flows/requester.flow';
import { SupplierFSM } from '../../flows/supplier.flow';
import { tryNormalizePhoneBR } from '../../utils/phone';
import { transcribeAudio } from '../../services/audio-transcription.service';

/**
 * Serviço principal de WhatsApp
 * Orquestra recebimento de mensagens, interpretação NLU e roteamento para FSM
 */
export class WhatsAppService {
  private provider: IWhatsAppProvider;
  private producerFSM: ProducerFSM;
  private supplierFSM: SupplierFSM;

  constructor() {
    this.provider = WhatsAppFactory.create();
    this.producerFSM = new ProducerFSM();
    this.supplierFSM = new SupplierFSM();
  }

  /**
   * Envia mensagem via provider configurado
   */
  async sendMessage(message: OutgoingMessage): Promise<void> {
    try {
      await this.provider.sendMessage(message);
      logger.info(`Message sent via ${this.provider.getProviderName()}`, {
        to: message.to,
        bodyLength: message.body.length,
      });
    } catch (error) {
      logger.error('Failed to send message', { error, message });
      throw error;
    }
  }

  /**
   * FEAT-PDF-001 — Envia documento (PDF) ao destinatário.
   *
   * O provider em produção é Twilio (único que suporta sendDocument).
   * Em dev/legacy com Evolution, o provider lança erro claro.
   *
   * NÃO loga mediaUrl (contém X-Amz-Signature; vazaria acesso ao objeto).
   */
  async sendDocument(message: OutgoingDocumentMessage): Promise<void> {
    try {
      await this.provider.sendDocument(message);
      logger.info(`Document sent via ${this.provider.getProviderName()}`, {
        to: message.to,
        filename: message.filename,
      });
    } catch (error) {
      logger.error('Failed to send document', {
        to: message.to,
        filename: message.filename,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Processa mensagem recebida do webhook
   * 1. Identifica se é produtor ou fornecedor
   * 2. Interpreta mensagem com OpenAI (se necessário)
   * 3. Roteia para FSM apropriada
   */
  async handleIncomingMessage(incomingMessage: IncomingMessage): Promise<void> {
    const { from, body, type, mediaUrl, mimeType } = incomingMessage;

    // Se for mensagem de áudio, transcrever primeiro
    let processedMessage = body;
    let extractedData: any = null;

    if (type === 'audio' && mediaUrl) {
      try {
        processedMessage = await this.transcribeAudioMessage(from, mediaUrl, mimeType);
      } catch (error) {
        logger.error('Failed to transcribe audio', { error, from });
        // FEAT-007 § 5.4 — mensagem educativa quando Whisper falha
        await this.sendMessage({
          to: from,
          body: 'Não consegui entender o áudio. 😔\n\nPode digitar os dados? Ex:\n_SSP 20% 60 ton, Rio Verde, CIF, 30/08_',
        });
        return;
      }

      // A transcrição entra no mesmo pipeline de texto — quando smart
      // fill estiver ativo (env.SMART_FILL_ENABLED=true), o handleIdle
      // do requester.flow já roda extractAndValidate sobre o texto.
      // Não mantemos o atalho legado extractMultipleFields aqui para
      // evitar dois pipelines NLU competindo.
    }

    // Se for mensagem de imagem, extrair dados da nota fiscal
    if (type === 'image' && mediaUrl) {
      try {
        extractedData = await this.analyzeImageMessage(from, mediaUrl);
        // Criar mensagem confirmando dados extraídos
        processedMessage = `nota fiscal: ${JSON.stringify(extractedData)}`;

        if (extractedData) {
          // Attach structured data for FSM to use
          (incomingMessage as any)._extractedData = extractedData;
          logger.info('Image data extracted and attached to message', { from, extractedData });
        }
      } catch (error) {
        logger.error('Failed to analyze image', { error, from });
        await this.sendMessage({
          to: from,
          body: '❌ Não consegui analisar a imagem. Tente fotografar novamente com melhor iluminação.',
        });
        return;
      }
    }

    logger.info('Processing incoming message', { from, body: processedMessage, type });

    // Normalizar telefone para formato canônico +55DDXXXXXXXXX
    const normalizedPhone = tryNormalizePhoneBR(from) ?? from;
    // Manter variantes como fallback para dados legados não-migrados
    const phoneVariants = this.normalizePhoneVariants(from);
    if (normalizedPhone !== from && !phoneVariants.includes(normalizedPhone)) {
      phoneVariants.push(normalizedPhone);
    }

    try {
      // Verificar se é produtor (busca canônica + variantes legadas)
      const producer = await prisma.producer.findFirst({
        where: { phone: { in: phoneVariants } },
        include: { conversationState: true },
      });

      if (producer) {
        // Rotear para FSM de produtor
        await this.handleProducerMessage(producer.id, processedMessage);
        return;
      }

      // Verificar se é fornecedor
      const supplier = await prisma.supplier.findFirst({
        where: { phone: { in: phoneVariants } },
      });

      if (supplier) {
        // Rotear para FSM de fornecedor
        await this.handleSupplierMessage(supplier.id, processedMessage);
        return;
      }

      // Usuário não cadastrado
      logger.warn('Message from unknown number', { from, normalizedPhone, phoneVariants });
      await this.sendMessage({
        to: from,
        body: `Olá! Seu número não está cadastrado no CotaObra.\n\nPara começar a usar, entre em contato com nosso suporte.`,
      });
    } catch (error) {
      logger.error('Error handling incoming message', { error, from, body });

      // Enviar mensagem de erro genérica
      await this.sendMessage({
        to: from,
        body: 'Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente em alguns instantes.',
      }).catch((sendError) => {
        logger.error('Failed to send error message', { sendError });
      });
    }
  }

  /**
   * Transcreve mensagem de áudio
   */
  private async transcribeAudioMessage(
    phone: string,
    mediaUrl: string,
    mimeType?: string
  ): Promise<string> {
    // Enviar feedback visual
    await this.sendMessage({
      to: phone,
      body: '🎙️ Ouvindo áudio...',
    });

    // Download do áudio
    const audioBuffer = await this.downloadMedia(mediaUrl);

    // FF-BE-020 — Transcreve via pipeline com FFmpeg (OPUS → MP3
    // quando necessário). Falhas de conversão fazem fallback para
    // o buffer original — Whisper costuma aceitar ogg.
    const transcription = await transcribeAudio(audioBuffer, mimeType ?? 'audio/ogg');

    // Confirmar transcrição
    await this.sendMessage({
      to: phone,
      body: `✅ Transcrevi: "${transcription}"\n\nProcessando...`,
    });

    return transcription;
  }

  /**
   * Analisa mensagem de imagem (nota fiscal)
   */
  private async analyzeImageMessage(
    phone: string,
    mediaUrl: string
  ): Promise<{
    product?: string;
    quantity?: string;
    unit?: string;
    price?: number;
    supplier?: string;
  }> {
    // Enviar feedback visual
    await this.sendMessage({
      to: phone,
      body: '📷 Analisando nota fiscal...',
    });

    // Download da imagem
    const imageBuffer = await this.downloadMedia(mediaUrl);

    // Analisar com GPT-4 Vision
    const extracted = await openaiService.analyzeInvoiceImage(imageBuffer);

    // Confirmar dados extraídos
    let confirmationMsg = '✅ *Extraí os seguintes dados:*\n\n';

    if (extracted.product) confirmationMsg += `📦 *Produto:* ${extracted.product}\n`;
    if (extracted.quantity && extracted.unit) {
      confirmationMsg += `📊 *Quantidade:* ${extracted.quantity} ${extracted.unit}\n`;
    }
    if (extracted.price) confirmationMsg += `💰 *Preço anterior:* R$ ${extracted.price.toFixed(2)}\n`;
    if (extracted.supplier) confirmationMsg += `🏢 *Fornecedor:* ${extracted.supplier}\n`;

    confirmationMsg += '\n*Quer cotar o mesmo produto?*\n\n';
    confirmationMsg += '1️⃣ Sim, mesma quantidade\n';
    confirmationMsg += '2️⃣ Sim, mas alterar quantidade\n';
    confirmationMsg += '3️⃣ Nova cotação';

    await this.sendMessage({
      to: phone,
      body: confirmationMsg,
    });

    return extracted;
  }

  /**
   * Download de arquivo de mídia
   */
  private async downloadMedia(url: string): Promise<Buffer> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download media: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      logger.error('Failed to download media', { error, url });
      throw new Error('Não consegui baixar o arquivo de mídia.');
    }
  }

  /**
   * Processa mensagem de produtor
   */
  private async handleProducerMessage(producerId: string, message: string): Promise<void> {
    // Buscar estado da conversa
    let state = await prisma.conversationState.findUnique({
      where: { producerId },
    });

    // Se não houver estado ou estiver IDLE, interpretar com NLU
    if (!state || state.step === 'IDLE') {
      const nluResult = await openaiService.interpretMessage(message);

      // Se detectar intenção de nova cotação, iniciar fluxo
      if (nluResult.intent === 'nova_cotacao') {
        await this.producerFSM.handleMessage(producerId, message, nluResult);
        return;
      }
    }

    // Rotear para handler do estado atual
    await this.producerFSM.handleMessage(producerId, message);
  }

  /**
   * Processa mensagem de fornecedor
   */
  private async handleSupplierMessage(supplierId: string, message: string): Promise<void> {
    await this.supplierFSM.handleMessage(supplierId, message);
  }

  /**
   * Gera variantes do número para lidar com o 9º dígito brasileiro
   * Evolution API remove o 9 extra: +556499696787 → busca +5564999696787 também
   */
  private normalizePhoneVariants(phone: string): string[] {
    const variants = new Set<string>([phone]);

    // Formato: +55XXXXXXXXXXX
    const match = phone.match(/^\+55(\d{2})(\d+)$/);
    if (match) {
      const ddd = match[1];
      const number = match[2];

      if (number.length === 8) {
        // Número com 8 dígitos → adicionar 9 no início
        variants.add(`+55${ddd}9${number}`);
      } else if (number.length === 9 && number.startsWith('9')) {
        // Número com 9 dígitos começando com 9 → adicionar versão sem o 9
        variants.add(`+55${ddd}${number.substring(1)}`);
      }
    }

    return Array.from(variants);
  }

  /**
   * Parseia payload do webhook
   */
  parseWebhookPayload(payload: unknown): IncomingMessage {
    return this.provider.parseIncomingMessage(payload);
  }

  /**
   * Verifica webhook (usado em GET requests)
   */
  verifyWebhook(query: Record<string, unknown>): boolean {
    return this.provider.verifyWebhook(query);
  }
}

// Singleton
export const whatsappService = new WhatsAppService();
