import { prisma } from '../config/database';
import { credentialsEncryptor } from './credentials-encryptor.service';
import { logger } from '../utils/logger';
import twilio from 'twilio';
import axios from 'axios';

/**
 * Tipos de providers suportados
 */
export type WhatsAppProvider = 'twilio' | 'evolution' | 'meta';

/**
 * Credenciais por provider
 */
export interface TwilioCredentials {
  accountSid: string;
  authToken: string;
  whatsappNumber: string;
}

export interface EvolutionCredentials {
  apiUrl: string;
  apiKey: string;
  instanceName: string;
}

export type ProviderCredentials = TwilioCredentials | EvolutionCredentials;

/**
 * Serviço para gerenciar configurações de WhatsApp por tenant
 */
export class WhatsAppConfigService {
  /**
   * Obtém configuração do tenant
   */
  async getConfig(tenantId: string) {
    const config = await prisma.whatsAppConfig.findUnique({
      where: { tenantId },
    });

    if (!config) {
      return null;
    }

    // Descriptografar credenciais
    const credentials = credentialsEncryptor.decrypt(config.credentials as string);

    return {
      ...config,
      credentials,
    };
  }

  /**
   * Cria ou atualiza configuração
   */
  async upsertConfig(params: {
    tenantId: string;
    provider: WhatsAppProvider;
    credentials: ProviderCredentials;
    userId: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const { tenantId, provider, credentials, userId, ipAddress, userAgent } = params;

    // Criptografar credenciais
    const encryptedCredentials = credentialsEncryptor.encrypt(credentials);

    // Upsert config
    const config = await prisma.whatsAppConfig.upsert({
      where: { tenantId },
      create: {
        tenantId,
        provider,
        credentials: encryptedCredentials as any,
        configuredBy: userId,
      },
      update: {
        provider,
        credentials: encryptedCredentials as any,
        configuredBy: userId,
        updatedAt: new Date(),
      },
    });

    // Configurar webhook automaticamente para Evolution API
    if (provider === 'evolution') {
      await this.registerEvolutionWebhook(credentials as EvolutionCredentials).catch((err) => {
        logger.warn('Failed to register Evolution webhook (non-fatal)', { error: err.message });
      });
    }

    // Log de auditoria
    await this.logAction({
      tenantId,
      action: config.configuredAt === config.updatedAt ? 'created' : 'updated',
      changes: { provider },
      performedBy: userId,
      ipAddress,
      userAgent,
      success: true,
    });

    logger.info('WhatsApp config updated', { tenantId, provider });

    return config;
  }

  /**
   * Registra webhook no Evolution API automaticamente
   */
  async registerEvolutionWebhook(credentials: EvolutionCredentials): Promise<void> {
    const { apiUrl, apiKey, instanceName } = credentials;

    // Determinar URL pública do backend
    const webhookUrl = process.env.WEBHOOK_URL
      ? `${process.env.WEBHOOK_URL}/api/whatsapp/webhook`
      : null;

    if (!webhookUrl) {
      logger.warn('WEBHOOK_URL not set — skipping Evolution webhook registration');
      return;
    }

    const payload = {
      webhook: {
        enabled: true,
        url: webhookUrl,
        headers: {},
        byEvents: false,
        base64: false,
        events: [
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'CONNECTION_UPDATE',
        ],
      },
    };

    logger.info('Registering Evolution webhook', { instanceName, webhookUrl });

    await axios.post(
      `${apiUrl}/webhook/set/${instanceName}`,
      payload,
      {
        headers: { apikey: apiKey },
        timeout: 10000,
      }
    );

    logger.info('Evolution webhook registered successfully', { instanceName, webhookUrl });
  }

  /**
   * Testa conexão com o provider
   */
  async testConnection(tenantId: string): Promise<{
    success: boolean;
    message: string;
    details?: any;
  }> {
    const config = await this.getConfig(tenantId);

    if (!config) {
      return {
        success: false,
        message: 'Configuração não encontrada',
      };
    }

    try {
      if (config.provider === 'twilio') {
        return await this.testTwilio(config.credentials as TwilioCredentials);
      } else if (config.provider === 'evolution') {
        return await this.testEvolution(config.credentials as EvolutionCredentials);
      } else {
        return {
          success: false,
          message: 'Provider não suportado',
        };
      }
    } catch (error) {
      logger.error('Connection test failed', { error, tenantId, provider: config.provider });

      // Atualizar status
      await prisma.whatsAppConfig.update({
        where: { tenantId },
        data: {
          isConnected: false,
          lastHealthCheck: new Date(),
          connectionError: (error as Error).message,
        },
      });

      return {
        success: false,
        message: (error as Error).message || 'Erro ao testar conexão',
      };
    }
  }

  /**
   * Testa conexão Twilio
   */
  private async testTwilio(credentials: TwilioCredentials) {
    const { accountSid, authToken } = credentials;

    const client = twilio(accountSid, authToken);

    try {
      // Tentar obter informações da conta
      const account = await client.api.v2010.accounts(accountSid).fetch();

      return {
        success: true,
        message: 'Conectado com sucesso!',
        details: {
          accountName: account.friendlyName,
          status: account.status,
        },
      };
    } catch (error: any) {
      throw new Error(`Erro Twilio: ${error.message}`);
    }
  }

  /**
   * Testa conexão Evolution API
   */
  private async testEvolution(credentials: EvolutionCredentials) {
    const { apiUrl, apiKey, instanceName } = credentials;

    try {
      const response = await axios.get(
        `${apiUrl}/instance/connectionState/${instanceName}`,
        {
          headers: { apikey: apiKey },
          timeout: 10000,
        }
      );

      const state = response.data?.instance?.state;

      if (state === 'open') {
        return {
          success: true,
          message: 'Conectado ao WhatsApp!',
          details: {
            state,
            phone: response.data?.instance?.owner,
          },
        };
      } else {
        return {
          success: false,
          message: `WhatsApp não conectado (estado: ${state})`,
          details: { state },
        };
      }
    } catch (error: any) {
      throw new Error(`Erro Evolution API: ${error.message}`);
    }
  }

  /**
   * Obtém QR Code para Evolution API
   */
  async getQRCode(tenantId: string): Promise<{
    success: boolean;
    qrCode?: string;
    message: string;
  }> {
    const config = await this.getConfig(tenantId);

    if (!config || config.provider !== 'evolution') {
      return {
        success: false,
        message: 'QR Code disponível apenas para Evolution API',
      };
    }

    const credentials = config.credentials as EvolutionCredentials;

    try {
      const response = await axios.get(
        `${credentials.apiUrl}/instance/connect/${credentials.instanceName}`,
        {
          headers: { apikey: credentials.apiKey },
          timeout: 15000,
        }
      );

      logger.info('Evolution QR code raw response', {
        tenantId,
        dataKeys: response.data ? Object.keys(response.data) : [],
        data: JSON.stringify(response.data).substring(0, 300),
      });

      // Suportar múltiplos formatos da Evolution API (v1, v2)
      const qrCode =
        response.data?.base64 ||
        response.data?.qrcode?.base64 ||
        response.data?.qr?.base64 ||
        response.data?.code ||
        response.data?.qrcode;

      if (qrCode) {
        // Garantir prefixo data URI se necessário
        const qrCodeData = qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`;
        return {
          success: true,
          qrCode: qrCodeData,
          message: 'QR Code obtido com sucesso',
        };
      } else {
        return {
          success: false,
          message: 'QR Code não disponível. A instância pode já estar conectada ou foi deletada no Evolution API.',
        };
      }
    } catch (error: any) {
      logger.error('Failed to get QR code', { error, tenantId });
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Erro ao obter QR Code',
      };
    }
  }

  /**
   * Health check (executar periodicamente)
   */
  async healthCheck(tenantId: string) {
    const result = await this.testConnection(tenantId);

    await prisma.whatsAppConfig.update({
      where: { tenantId },
      data: {
        isConnected: result.success,
        lastHealthCheck: new Date(),
        connectionError: result.success ? null : result.message,
      },
    });

    return result;
  }

  /**
   * Obtém estatísticas de uso
   */
  async getStats(_tenantId: string, period: '24h' | '7d' | '30d' = '24h') {
    const periodMs = {
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
    };

    const since = new Date(Date.now() - periodMs[period]);

    // Buscar métricas de conversação
    const metrics = await prisma.conversationMetric.groupBy({
      by: ['eventType'],
      where: {
        timestamp: { gte: since },
        // TODO: filtrar por tenant quando tivermos relação
      },
      _count: {
        id: true,
      },
    });

    const sent = metrics.find((m) => m.eventType === 'message_sent')?._count.id || 0;
    const received = metrics.find((m) => m.eventType === 'message_received')?._count.id || 0;
    const errors = metrics.find((m) => m.eventType === 'error')?._count.id || 0;

    const errorRate = sent > 0 ? (errors / sent) * 100 : 0;

    return {
      sent,
      received,
      errors,
      errorRate: parseFloat(errorRate.toFixed(2)),
      period,
    };
  }

  /**
   * Deleta configuração
   */
  async deleteConfig(params: {
    tenantId: string;
    userId: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const { tenantId, userId, ipAddress, userAgent } = params;

    await prisma.whatsAppConfig.delete({
      where: { tenantId },
    });

    // Log de auditoria
    await this.logAction({
      tenantId,
      action: 'deleted',
      changes: {},
      performedBy: userId,
      ipAddress,
      userAgent,
      success: true,
    });

    logger.info('WhatsApp config deleted', { tenantId });
  }

  /**
   * Registra ação no log de auditoria
   */
  private async logAction(params: {
    tenantId: string;
    action: string;
    changes: any;
    performedBy: string;
    ipAddress?: string;
    userAgent?: string;
    success: boolean;
    errorMsg?: string;
  }) {
    await prisma.whatsAppConfigLog.create({
      data: {
        tenantId: params.tenantId,
        action: params.action,
        changes: params.changes,
        performedBy: params.performedBy,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        success: params.success,
        errorMsg: params.errorMsg,
      },
    });
  }

  /**
   * Obtém logs de auditoria
   */
  async getAuditLogs(tenantId: string, limit = 50) {
    return await prisma.whatsAppConfigLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}

export const whatsappConfigService = new WhatsAppConfigService();
