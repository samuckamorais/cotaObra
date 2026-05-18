import { Response } from 'express';
import { logger } from '../utils/logger';

/**
 * Gerenciador de conexões Server-Sent Events (SSE).
 *
 * Mantém mapa de tenantId → lista de Response streams.
 * Permite emitir eventos para todos os clientes de um tenant.
 */
class SseManager {
  private clients = new Map<string, Response[]>();

  /**
   * Registra um novo cliente SSE para o tenant.
   * Remove automaticamente quando a conexão é fechada.
   */
  addClient(tenantId: string, res: Response): void {
    if (!this.clients.has(tenantId)) {
      this.clients.set(tenantId, []);
    }
    this.clients.get(tenantId)!.push(res);

    res.on('close', () => {
      this.removeClient(tenantId, res);
    });

    logger.info('SSE client connected', { tenantId, totalClients: this.getClientCount(tenantId) });
  }

  /**
   * Remove um cliente SSE.
   */
  removeClient(tenantId: string, res: Response): void {
    const list = this.clients.get(tenantId) || [];
    const filtered = list.filter((r) => r !== res);
    if (filtered.length > 0) {
      this.clients.set(tenantId, filtered);
    } else {
      this.clients.delete(tenantId);
    }
    logger.info('SSE client disconnected', { tenantId, totalClients: filtered.length });
  }

  /**
   * Emite um evento para todos os clientes de um tenant.
   */
  emit(tenantId: string, event: string, data: unknown): void {
    const clients = this.clients.get(tenantId) || [];
    if (clients.length === 0) return;

    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

    for (const res of clients) {
      try {
        res.write(payload);
      } catch {
        // Client disconnected — will be cleaned up by close event
      }
    }

    logger.info('SSE event emitted', { tenantId, event, clients: clients.length });
  }

  /**
   * Retorna o número de clientes conectados para um tenant.
   */
  getClientCount(tenantId: string): number {
    return this.clients.get(tenantId)?.length ?? 0;
  }

  /**
   * Retorna o total de clientes conectados em todos os tenants.
   */
  getTotalClients(): number {
    let total = 0;
    for (const list of this.clients.values()) {
      total += list.length;
    }
    return total;
  }
}

export const sseManager = new SseManager();
