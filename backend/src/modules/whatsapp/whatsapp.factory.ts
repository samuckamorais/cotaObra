import { IWhatsAppProvider } from './interfaces/whatsapp-provider.interface';
import { TwilioProvider } from './providers/twilio.provider';
import { EvolutionProvider } from './providers/evolution.provider';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

/**
 * Factory para criar a instância correta do provider de WhatsApp
 * com base na variável de ambiente WHATSAPP_PROVIDER
 */
export class WhatsAppFactory {
  private static instance: IWhatsAppProvider | null = null;

  static create(): IWhatsAppProvider {
    if (this.instance) {
      return this.instance;
    }

    switch (env.WHATSAPP_PROVIDER) {
      case 'twilio':
        logger.info('🔌 WhatsApp provider: Twilio');
        this.instance = new TwilioProvider();
        break;

      case 'evolution':
        logger.info('🔌 WhatsApp provider: Evolution API');
        this.instance = new EvolutionProvider();
        break;

      default:
        logger.warn(`Unknown WhatsApp provider: ${env.WHATSAPP_PROVIDER}. Defaulting to Twilio.`);
        this.instance = new TwilioProvider();
    }

    return this.instance;
  }

  /**
   * Reseta instância (útil para testes)
   */
  static reset(): void {
    this.instance = null;
  }
}
