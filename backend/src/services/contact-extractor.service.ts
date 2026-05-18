import { openaiService } from './openai.service';
import { ContactData } from '../types';
import { logger } from '../utils/logger';
import { tryNormalizePhoneBR } from '../utils/phone';

/**
 * Serviço para extrair dados de contatos compartilhados via WhatsApp
 */
export class ContactExtractorService {
  /**
   * Detecta se uma mensagem contém um vCard (formato de contato)
   */
  isVCard(message: string): boolean {
    return (
      message.includes('BEGIN:VCARD') ||
      message.startsWith('FN:') ||
      message.includes('\nFN:') ||
      message.includes('\nTEL')
    );
  }

  /**
   * Extrai dados de um vCard formatado
   */
  extractFromVCard(vcard: string): ContactData | null {
    try {
      // Normalizar quebras de linha (CRLF ou LF)
      const lines = vcard.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
      const data: Partial<ContactData> = {};

      for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed.startsWith('FN:')) {
          data.name = trimmed.substring(3).trim();
        } else if (trimmed.startsWith('N:') && !data.name) {
          // N:Sobrenome;Nome;;; → reconstruir nome
          const parts = trimmed.substring(2).split(';').map((p) => p.trim()).filter(Boolean);
          if (parts.length >= 2) data.name = `${parts[1]} ${parts[0]}`.trim();
          else if (parts.length === 1) data.name = parts[0];
        } else if (trimmed.startsWith('TEL') || trimmed.includes(':TEL')) {
          // TEL:+5564999999999 ou TEL;TYPE=CELL:+5564999999999
          const colonIdx = trimmed.indexOf(':');
          if (colonIdx !== -1) {
            const phone = trimmed.substring(colonIdx + 1).trim();
            if (phone && !data.phone) {
              data.phone = this.normalizePhone(phone);
            }
          }
        } else if (trimmed.startsWith('EMAIL') && trimmed.includes(':')) {
          const colonIdx = trimmed.indexOf(':');
          data.email = trimmed.substring(colonIdx + 1).trim();
        } else if (trimmed.startsWith('ORG:')) {
          data.company = trimmed.substring(4).trim();
        }
      }

      if (data.name && data.phone) {
        logger.info('vCard parsed successfully', { name: data.name, phone: data.phone });
        return data as ContactData;
      }

      logger.warn('vCard missing required fields', { data });
      return null;
    } catch (error) {
      logger.error('Failed to parse vCard', { error });
      return null;
    }
  }

  /**
   * Extrai dados de contato de um payload de WhatsApp (formato Evolution API)
   * Tenta vCard primeiro, depois OpenAI como fallback
   */
  async extractContactData(contactText: string): Promise<ContactData | null> {
    // 1. Tentar parsear como vCard diretamente
    if (this.isVCard(contactText)) {
      const fromVCard = this.extractFromVCard(contactText);
      if (fromVCard) return fromVCard;
    }

    // 2. Fallback: OpenAI para texto livre ou vCard malformado
    try {
      const extracted = await openaiService.extractContactFromText(contactText);
      if (extracted && extracted.name && extracted.phone) {
        extracted.phone = this.normalizePhone(extracted.phone);
        return extracted;
      }
    } catch (error) {
      logger.error('OpenAI contact extraction failed', { error });
    }

    return null;
  }

  /**
   * Extrai dados de contato de um payload do WhatsApp (formato Evolution API)
   */
  extractFromWhatsAppPayload(payload: any): ContactData | null {
    try {
      // Formato Evolution API: contactMessage
      if (payload?.message?.contactMessage) {
        const cm = payload.message.contactMessage;
        if (cm.vcard) {
          const fromVCard = this.extractFromVCard(cm.vcard);
          if (fromVCard) return fromVCard;
        }
        if (cm.displayName) {
          return { name: cm.displayName, phone: '' };
        }
      }

      // Formato Twilio/WhatsApp legado
      if (payload.ProfileName && payload.WaId) {
        return {
          name: payload.ProfileName,
          phone: this.normalizePhone(payload.WaId),
        };
      }

      // Formato de contato estruturado
      if (payload.contacts && Array.isArray(payload.contacts)) {
        const contact = payload.contacts[0];
        if (contact && contact.name && contact.phones && contact.phones[0]) {
          return {
            name: contact.name,
            phone: this.normalizePhone(contact.phones[0].phone),
            email: contact.emails?.[0]?.email,
            company: contact.org?.company,
          };
        }
      }

      return null;
    } catch (error) {
      logger.error('Failed to extract contact from WhatsApp payload', { error });
      return null;
    }
  }

  /**
   * Normaliza número de telefone para formato canônico +55DDXXXXXXXXX
   * Usa normalizePhoneBR; fallback para limpeza básica se inválido.
   */
  normalizePhone(phone: string): string {
    const normalized = tryNormalizePhoneBR(phone);
    if (normalized) return normalized;

    // Fallback para telefones não-BR ou malformados
    let cleaned = phone.replace(/[^\d+]/g, '');
    if (!cleaned.startsWith('+')) {
      if (cleaned.startsWith('55') && cleaned.length >= 12) {
        cleaned = '+' + cleaned;
      } else {
        cleaned = '+55' + cleaned;
      }
    }
    return cleaned;
  }
}

export const contactExtractorService = new ContactExtractorService();
