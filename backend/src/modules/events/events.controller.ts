import { Request, Response } from 'express';
import { sseManager } from '../../lib/sse-manager';

/**
 * Controller para Server-Sent Events.
 * GET /api/events — stream de eventos em tempo real.
 */
export class EventsController {
  /**
   * Inicia stream SSE para o tenant do usuário autenticado.
   */
  static stream(req: Request, res: Response): void {
    const tenantId = (req as any).user?.tenantId;

    if (!tenantId) {
      res.status(403).json({ success: false, error: { message: 'Tenant não identificado' } });
      return;
    }

    // Headers SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Nginx proxy compatibility
    res.flushHeaders();

    // Registrar cliente
    sseManager.addClient(tenantId, res);

    // Heartbeat a cada 30s para manter conexão viva
    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeat);
      }
    }, 30000);

    // Limpeza quando conexão fecha
    res.on('close', () => {
      clearInterval(heartbeat);
    });
  }
}
