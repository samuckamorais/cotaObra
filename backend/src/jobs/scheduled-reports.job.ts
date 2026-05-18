import cron from 'node-cron';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { ReportService } from '../modules/reports/report.service';

/**
 * Job horário para processar relatórios agendados.
 * Roda a cada hora: 0 * * * *
 * Busca report_schedules com nextRunAt <= agora e active = true,
 * gera o relatório e atualiza nextRunAt conforme frequency.
 */
export function startScheduledReportsJob(): void {
  cron.schedule('0 * * * *', async () => {
    logger.info('Running scheduled reports job');

    try {
      const now = new Date();

      const schedules = await prisma.reportSchedule.findMany({
        where: {
          active: true,
          nextRunAt: { lte: now },
        },
        include: {
          user: { select: { email: true, name: true } },
        },
      });

      if (schedules.length === 0) return;

      let processed = 0;

      for (const schedule of schedules) {
        try {
          // Gerar dados do relatório
          const params = { from: undefined, to: undefined };

          const reportData = await (async () => {
            switch (schedule.reportType) {
              case 'funnel':
                return ReportService.getFunnel(schedule.tenantId, schedule.userId, params);
              case 'savings':
                return ReportService.getSavings(schedule.tenantId, schedule.userId, params);
              case 'operational':
                return ReportService.getOperational(schedule.tenantId, schedule.userId);
              case 'supplier-performance':
                return ReportService.getSupplierPerformance(schedule.tenantId, schedule.userId, params);
              case 'category-region':
                return ReportService.getCategoryRegion(schedule.tenantId, schedule.userId, params);
              default:
                return null;
            }
          })();

          if (!reportData) {
            logger.warn('Unknown report type in schedule', { scheduleId: schedule.id, reportType: schedule.reportType });
            continue;
          }

          // Calcular próxima execução baseado na frequência
          const nextRunAt = calculateNextRun(now, schedule.frequency);

          // Atualizar schedule
          await prisma.reportSchedule.update({
            where: { id: schedule.id },
            data: {
              lastRunAt: now,
              nextRunAt,
            },
          });

          // Log do envio (email real seria integrado com serviço de email)
          logger.info('Scheduled report generated', {
            scheduleId: schedule.id,
            reportType: schedule.reportType,
            userId: schedule.userId,
            recipients: schedule.recipients,
            nextRunAt,
          });

          processed++;
        } catch (error) {
          logger.error('Error processing scheduled report', {
            scheduleId: schedule.id,
            error: String(error),
          });
        }
      }

      if (processed > 0) {
        logger.info('Scheduled reports job completed', { processed, total: schedules.length });
      }
    } catch (error) {
      logger.error('Error in scheduled reports job', { error });
    }
  });

  logger.info('✅ Scheduled reports job scheduled (hourly)');
}

/**
 * Calcula próxima execução baseado na frequência.
 */
function calculateNextRun(from: Date, frequency: string): Date {
  const next = new Date(from);

  switch (frequency) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      break;
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    default:
      // Default to weekly
      next.setDate(next.getDate() + 7);
  }

  return next;
}
