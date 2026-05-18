import { api } from './client';

export interface WhatsAppConfig {
  id: string;
  tenantId: string;
  provider: 'twilio' | 'evolution' | 'meta';
  credentials: TwilioCredentials | EvolutionCredentials;
  isConnected: boolean;
  lastHealthCheck?: string;
  connectionError?: string;
  webhookUrl?: string;
  messagesSentToday: number;
  messagesReceivedToday: number;
  lastMessageAt?: string;
  configuredAt: string;
  updatedAt: string;
}

export interface TwilioCredentials {
  accountSid: string;
  authToken: string;
  whatsappNumber: string;
}

export interface EvolutionCredentials {
  apiUrl: string;
  apiKey?: string;
  instanceName: string;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  details?: any;
}

export interface WhatsAppStats {
  sent: number;
  received: number;
  errors: number;
  errorRate: number;
  period: '24h' | '7d' | '30d';
}

export interface AuditLog {
  id: string;
  tenantId: string;
  action: string;
  changes: any;
  performedBy: string;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  errorMsg?: string;
  createdAt: string;
}

export const whatsappConfigApi = {
  /**
   * Obtém configuração atual
   */
  async getConfig(): Promise<WhatsAppConfig | null> {
    try {
      const response = await api.get(`/admin/whatsapp/config`);
      return response.data.success ? response.data.data : null;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  },

  /**
   * Atualiza configuração
   */
  async updateConfig(data: {
    provider: 'twilio' | 'evolution' | 'meta';
    credentials: TwilioCredentials | EvolutionCredentials;
  }): Promise<void> {
    const response = await api.put(`/admin/whatsapp/config`, data);
    if (!response.data.success) {
      throw new Error(response.data.message || 'Erro ao salvar configuração');
    }
  },

  /**
   * Testa conexão
   */
  async testConnection(): Promise<ConnectionTestResult> {
    const response = await api.post(`/admin/whatsapp/test`);
    return {
      success: response.data.success,
      message: response.data.message,
      details: response.data.details,
    };
  },

  /**
   * Obtém QR Code (Evolution API)
   */
  async getQRCode(): Promise<{ success: boolean; qrCode?: string; message: string }> {
    const response = await api.get(`/admin/whatsapp/qrcode`);
    return response.data;
  },

  /**
   * Reconecta
   */
  async reconnect(): Promise<{ success: boolean; message: string }> {
    const response = await api.post(`/admin/whatsapp/reconnect`);
    return response.data;
  },

  /**
   * Obtém estatísticas
   */
  async getStats(period: '24h' | '7d' | '30d' = '24h'): Promise<WhatsAppStats> {
    const response = await api.get(`/admin/whatsapp/stats`, {
      params: { period },
    });
    return response.data.data;
  },

  /**
   * Obtém logs de auditoria
   */
  async getLogs(limit = 50): Promise<AuditLog[]> {
    const response = await api.get(`/admin/whatsapp/logs`, {
      params: { limit },
    });
    return response.data.data;
  },

  /**
   * Registra webhook no Evolution API
   */
  async registerWebhook(): Promise<{ success: boolean; message: string }> {
    const response = await api.post(`/admin/whatsapp/webhook/register`);
    return response.data;
  },

  /**
   * Deleta configuração
   */
  async deleteConfig(): Promise<void> {
    const response = await api.delete(`/admin/whatsapp/config`);
    if (!response.data.success) {
      throw new Error(response.data.message || 'Erro ao deletar configuração');
    }
  },
};
