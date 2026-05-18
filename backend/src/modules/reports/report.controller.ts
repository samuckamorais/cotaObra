import { Request, Response } from 'express';
import { ErrorHandler } from '../../utils/error-handler';
import { ReportService } from './report.service';
import { FSMEventService } from '../../services/fsm-event.service';
import { exportToXlsx } from './exporters/xlsx.exporter';
import { exportToPdf } from './exporters/pdf.exporter';

function parseRange(req: Request): { startDate: Date; endDate: Date } {
  const q = req.query as Record<string, string>;
  const endDate = q.to ? new Date(q.to) : new Date();
  const startDate = q.from
    ? new Date(q.from)
    : new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { startDate, endDate };
}

export class ReportController {
  static funnel = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { tenantId, id: userId } = (req as any).user;
    const { from, to, producerId } = req.query as Record<string, string>;

    const data = await ReportService.getFunnel(tenantId, userId, { from, to, producerId });
    res.json({ success: true, data });
  });

  /**
   * FF-BE-009 — GET /api/reports/conversational-funnel
   *
   * Indicadores do funil de WhatsApp lidos de FSMEvent. Resposta
   * agrupa as 5 visões pedidas no spec:
   *   - funnel: contagem de produtores por estado destino
   *   - dropOff: top-10 estados com maior abandono
   *   - messagesPerQuote: distribuição de transições por cotação concluída
   *   - avgTimeToDispatch: tempo médio IDLE → DISPATCHED
   *   - eventCounts: contagem geral por tipo de evento
   *
   * Query params: ?from=YYYY-MM-DD&to=YYYY-MM-DD (default: últimos 7 dias)
   */
  static conversationalFunnel = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const range = parseRange(req);

      const [funnel, dropOff, messagesPerQuote, avgTimeToDispatch, eventCounts] =
        await Promise.all([
          FSMEventService.getFunnel(range),
          FSMEventService.getDropOff({ ...range, limit: 10 }),
          FSMEventService.getMessagesPerCompletedQuote(range),
          FSMEventService.getAvgTimeToDispatch(range),
          FSMEventService.getEventCounts(range),
        ]);

      res.json({
        success: true,
        data: {
          range: {
            from: range.startDate.toISOString(),
            to: range.endDate.toISOString(),
          },
          funnel,
          dropOff,
          messagesPerQuote,
          avgTimeToDispatch,
          eventCounts,
        },
      });
    },
  );

  static operational = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { tenantId, id: userId } = (req as any).user;

    const data = await ReportService.getOperational(tenantId, userId);
    res.json({ success: true, data });
  });

  static savings = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { tenantId, id: userId } = (req as any).user;
    const { from, to, producerId } = req.query as Record<string, string>;

    const data = await ReportService.getSavings(tenantId, userId, { from, to, producerId });
    res.json({ success: true, data });
  });

  static supplierPerformance = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { tenantId, id: userId } = (req as any).user;
    const { from, to } = req.query as Record<string, string>;

    const data = await ReportService.getSupplierPerformance(tenantId, userId, { from, to });
    res.json({ success: true, data });
  });

  static categoryRegion = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { tenantId, id: userId } = (req as any).user;
    const { from, to, producerId } = req.query as Record<string, string>;

    const data = await ReportService.getCategoryRegion(tenantId, userId, { from, to, producerId });
    res.json({ success: true, data });
  });

  static compare = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { tenantId, id: userId } = (req as any).user;
    const { type, currentFrom, currentTo, previousFrom, previousTo } = req.query as Record<string, string>;

    const data = await ReportService.comparePeriods(tenantId, userId, type as any,
      { from: currentFrom, to: currentTo },
      { from: previousFrom, to: previousTo }
    );
    res.json({ success: true, data });
  });

  /**
   * GET /api/reports/:type/export?format=pdf|xlsx
   * Exporta dados de relatório como JSON (estrutura preparada para conversão futura em PDF/Excel).
   * Retorna Content-Disposition attachment para download.
   */
  static exportReport = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { tenantId, id: userId } = (req as any).user;
    const { type } = req.params;
    const { format = 'json', from, to, producerId } = req.query as Record<string, string>;

    const validTypes = ['funnel', 'operational', 'savings', 'supplier-performance', 'category-region'];
    if (!validTypes.includes(type)) {
      res.status(400).json({
        success: false,
        error: { message: `Tipo de relatório inválido. Válidos: ${validTypes.join(', ')}` },
      });
      return;
    }

    const validFormats = ['json', 'pdf', 'xlsx'];
    if (!validFormats.includes(format)) {
      res.status(400).json({
        success: false,
        error: { message: `Formato inválido. Válidos: ${validFormats.join(', ')}` },
      });
      return;
    }

    // Buscar dados do relatório
    let data: any;
    const params = { from, to, producerId };

    switch (type) {
      case 'funnel':
        data = await ReportService.getFunnel(tenantId, userId, params);
        break;
      case 'operational':
        data = await ReportService.getOperational(tenantId, userId);
        break;
      case 'savings':
        data = await ReportService.getSavings(tenantId, userId, params);
        break;
      case 'supplier-performance':
        data = await ReportService.getSupplierPerformance(tenantId, userId, params);
        break;
      case 'category-region':
        data = await ReportService.getCategoryRegion(tenantId, userId, params);
        break;
    }

    const timestamp = new Date().toISOString().slice(0, 10);

    if (format === 'xlsx') {
      const buffer = await exportToXlsx(type, data);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="cotaobra-${type}-${timestamp}.xlsx"`);
      res.send(buffer);
      return;
    }

    if (format === 'pdf') {
      const buffer = await exportToPdf(type, data);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="cotaobra-${type}-${timestamp}.pdf"`);
      res.send(buffer);
      return;
    }

    // JSON (default)
    res.setHeader('Content-Disposition', `attachment; filename="cotaobra-${type}-${timestamp}.json"`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json({ success: true, meta: { type, format, exportedAt: new Date().toISOString() }, data });
  });
}
