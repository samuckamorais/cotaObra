import { Request, Response } from 'express';
import { whatsappConfigService } from '../../services/whatsapp-config.service';
import { logger } from '../../utils/logger';

/**
 * Controller para gerenciar configurações de WhatsApp (Admin)
 */
export class WhatsAppConfigController {
  /**
   * GET /api/admin/whatsapp/config
   * Obtém configuração atual do tenant
   */
  async getConfig(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId || 'default';

      const config = await whatsappConfigService.getConfig(tenantId);

      if (!config) {
        res.status(404).json({
          success: false,
          message: 'Configuração não encontrada',
        });
        return;
      }

      // Mascarar credenciais sensíveis antes de enviar
      const maskedConfig = {
        ...config,
        credentials: this.maskCredentials(config.provider, config.credentials),
      };

      res.json({
        success: true,
        data: maskedConfig,
      });
    } catch (error) {
      logger.error('Failed to get config', { error });
      res.status(500).json({
        success: false,
        message: 'Erro ao buscar configuração',
      });
    }
  }

  /**
   * PUT /api/admin/whatsapp/config
   * Atualiza configuração
   */
  async updateConfig(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId || 'default';
      const userId = req.user?.id!;
      const { provider, credentials } = req.body;

      // Validação básica
      if (!provider || !credentials) {
        res.status(400).json({
          success: false,
          message: 'Provider e credentials são obrigatórios',
        });
        return;
      }

      // Validar credenciais por provider
      const validation = this.validateCredentials(provider, credentials);
      if (!validation.valid) {
        res.status(400).json({
          success: false,
          message: validation.message,
        });
        return;
      }

      const config = await whatsappConfigService.upsertConfig({
        tenantId,
        provider,
        credentials,
        userId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.json({
        success: true,
        message: 'Configuração salva com sucesso',
        data: { id: config.id },
      });
    } catch (error) {
      logger.error('Failed to update config', { error });
      res.status(500).json({
        success: false,
        message: 'Erro ao salvar configuração',
      });
    }
  }

  /**
   * POST /api/admin/whatsapp/test
   * Testa conexão com WhatsApp
   */
  async testConnection(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId || 'default';

      const result = await whatsappConfigService.testConnection(tenantId);

      res.json({
        success: result.success,
        message: result.message,
        details: result.details,
      });
    } catch (error) {
      logger.error('Failed to test connection', { error });
      res.status(500).json({
        success: false,
        message: 'Erro ao testar conexão',
      });
    }
  }

  /**
   * GET /api/admin/whatsapp/qrcode
   * Obtém QR Code para Evolution API
   */
  async getQRCode(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId || 'default';

      // QR code muda a cada chamada — não cachear
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.set('Pragma', 'no-cache');

      const result = await whatsappConfigService.getQRCode(tenantId);

      res.json({
        success: result.success,
        message: result.message,
        qrCode: result.qrCode,
      });
    } catch (error) {
      logger.error('Failed to get QR code', { error });
      res.status(500).json({
        success: false,
        message: 'Erro ao obter QR Code',
      });
    }
  }

  /**
   * POST /api/admin/whatsapp/webhook/register
   * Registra webhook no Evolution API manualmente
   */
  async registerWebhook(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId || 'default';
      const config = await whatsappConfigService.getConfig(tenantId);

      if (!config || config.provider !== 'evolution') {
        res.status(400).json({
          success: false,
          message: 'Registro de webhook disponível apenas para Evolution API',
        });
        return;
      }

      await whatsappConfigService.registerEvolutionWebhook(config.credentials as any);

      res.json({
        success: true,
        message: 'Webhook registrado com sucesso no Evolution API',
      });
    } catch (error: any) {
      logger.error('Failed to register webhook', { error });
      res.status(500).json({
        success: false,
        message: error.response?.data?.message || error.message || 'Erro ao registrar webhook',
      });
    }
  }

  /**
   * POST /api/admin/whatsapp/reconnect
   * Força reconexão
   */
  async reconnect(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId || 'default';

      // Health check força tentativa de reconexão
      const result = await whatsappConfigService.healthCheck(tenantId);

      res.json({
        success: result.success,
        message: result.success
          ? 'Reconectado com sucesso'
          : 'Falha ao reconectar: ' + result.message,
      });
    } catch (error) {
      logger.error('Failed to reconnect', { error });
      res.status(500).json({
        success: false,
        message: 'Erro ao reconectar',
      });
    }
  }

  /**
   * GET /api/admin/whatsapp/stats
   * Obtém estatísticas de uso
   */
  async getStats(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId || 'default';
      const period = (req.query.period as '24h' | '7d' | '30d') || '24h';

      const stats = await whatsappConfigService.getStats(tenantId, period);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('Failed to get stats', { error });
      res.status(500).json({
        success: false,
        message: 'Erro ao buscar estatísticas',
      });
    }
  }

  /**
   * GET /api/admin/whatsapp/logs
   * Obtém logs de auditoria
   */
  async getLogs(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId || 'default';
      const limit = parseInt(req.query.limit as string) || 50;

      const logs = await whatsappConfigService.getAuditLogs(tenantId, limit);

      res.json({
        success: true,
        data: logs,
      });
    } catch (error) {
      logger.error('Failed to get logs', { error });
      res.status(500).json({
        success: false,
        message: 'Erro ao buscar logs',
      });
    }
  }

  /**
   * DELETE /api/admin/whatsapp/config
   * Remove configuração
   */
  async deleteConfig(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId || 'default';
      const userId = req.user?.id!;

      await whatsappConfigService.deleteConfig({
        tenantId,
        userId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.json({
        success: true,
        message: 'Configuração removida com sucesso',
      });
    } catch (error) {
      logger.error('Failed to delete config', { error });
      res.status(500).json({
        success: false,
        message: 'Erro ao remover configuração',
      });
    }
  }

  /**
   * Valida credenciais por provider
   */
  private validateCredentials(
    provider: string,
    credentials: any
  ): { valid: boolean; message?: string } {
    if (provider === 'twilio') {
      if (!credentials.accountSid || !credentials.authToken || !credentials.whatsappNumber) {
        return {
          valid: false,
          message: 'Twilio requer: accountSid, authToken e whatsappNumber',
        };
      }

      // Validar formato Account SID
      if (!credentials.accountSid.startsWith('AC')) {
        return {
          valid: false,
          message: 'Account SID inválido (deve começar com AC)',
        };
      }

      return { valid: true };
    } else if (provider === 'evolution') {
      if (!credentials.apiUrl || !credentials.instanceName) {
        return {
          valid: false,
          message: 'Evolution API requer: apiUrl e instanceName',
        };
      }

      // Validar URL
      try {
        new URL(credentials.apiUrl);
      } catch {
        return {
          valid: false,
          message: 'URL da Evolution API inválida',
        };
      }

      return { valid: true };
    } else {
      return {
        valid: false,
        message: 'Provider não suportado: ' + provider,
      };
    }
  }

  /**
   * Mascara credenciais sensíveis
   */
  private maskCredentials(provider: string, credentials: any): any {
    if (provider === 'twilio') {
      return {
        accountSid: credentials.accountSid?.substring(0, 10) + '••••••••',
        authToken: '••••••••••••••••',
        whatsappNumber: credentials.whatsappNumber,
      };
    } else if (provider === 'evolution') {
      return {
        apiUrl: credentials.apiUrl,
        apiKey: credentials.apiKey ? credentials.apiKey.substring(0, 6) + '••••••••' : undefined,
        instanceName: credentials.instanceName,
      };
    }
    return credentials;
  }
}

export const whatsappConfigController = new WhatsAppConfigController();
