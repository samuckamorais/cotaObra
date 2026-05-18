import { prisma } from '../config/database';
import { emailService } from './email.service';
import { logger } from '../utils/logger';

/**
 * Serviço de Email Drip Campaign.
 *
 * Sequência de 7 emails ao longo de 14 dias:
 * D0: Boas-vindas
 * D2: Dicas de uso
 * D5: Case de sucesso
 * D7: Recurso avançado
 * D10: Lembrete de uso
 * D12: Trial acabando
 * D14: Upgrade com desconto
 */

// CO-0-09: drip adaptado para o contexto de construtoras (engenheiro/comprador).
const DRIP_SEQUENCE = [
  { day: 0, subject: 'Bem-vindo ao CotaObra!', template: 'welcome' },
  { day: 2, subject: 'Dicas para suas primeiras cotações de obra', template: 'tips' },
  { day: 5, subject: 'Como construtoras estão economizando com o CotaObra', template: 'case_study' },
  { day: 7, subject: 'Conheça o ranking de fornecedores por material', template: 'advanced_feature' },
  { day: 10, subject: 'Você está aproveitando seu trial?', template: 'usage_reminder' },
  { day: 12, subject: 'Seu trial acaba em 2 dias', template: 'trial_ending' },
  { day: 14, subject: 'Último dia! 20% OFF no plano Pro', template: 'upgrade_offer' },
];

export class EmailDripService {
  /**
   * Processa emails pendentes para todos os usuários na sequência.
   * Chamado pelo cron diário.
   */
  static async processDaily(): Promise<{ sent: number; skipped: number }> {
    let sent = 0;
    let skipped = 0;

    // Buscar usuários com trial ativo (criados nos últimos 14 dias)
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 15);

    const users = await prisma.user.findMany({
      where: {
        createdAt: { gte: fourteenDaysAgo },
        active: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      },
    });

    for (const user of users) {
      const daysSinceSignup = Math.floor(
        (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24),
      );

      const dripStep = DRIP_SEQUENCE.find((s) => s.day === daysSinceSignup);
      if (!dripStep) {
        skipped++;
        continue;
      }

      try {
        await emailService.sendMail(
          user.email,
          dripStep.subject,
          this.buildDripEmail(user.name, dripStep.template, dripStep.subject),
        );
        sent++;
        logger.info('Drip email sent', {
          userId: user.id,
          day: dripStep.day,
          template: dripStep.template,
        });
      } catch (err) {
        logger.warn('Failed to send drip email', {
          userId: user.id,
          error: String(err),
        });
        skipped++;
      }
    }

    return { sent, skipped };
  }

  private static buildDripEmail(name: string, template: string, subject: string): string {
    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f7fa;font-family:'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7fa;padding:40px 20px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background-color:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <tr><td style="background:linear-gradient(135deg,#16a34a,#15803d);padding:24px 40px;text-align:center;">
          <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;">CotaObra</h1>
        </td></tr>
        <tr><td style="padding:32px 40px;">
          <h2 style="margin:0 0 16px;color:#1e293b;font-size:18px;">${subject}</h2>
          <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.6;">Olá, ${name}!</p>
          <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">${this.getTemplateContent(template)}</p>
        </td></tr>
        <tr><td style="background-color:#f8fafc;padding:16px 40px;text-align:center;border-top:1px solid #e2e8f0;">
          <p style="margin:0;color:#94a3b8;font-size:11px;">&copy; ${new Date().getFullYear()} CotaObra</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }

  private static getTemplateContent(template: string): string {
    // CO-0-09: conteúdo dos 7 emails da sequência adaptado para construtoras.
    const content: Record<string, string> = {
      welcome:
        'Sua conta foi criada com sucesso! Para começar: cadastre sua primeira obra, vincule alguns fornecedores de cimento/agregados/aço e mande sua lista de materiais pelo WhatsApp. Em minutos você recebe propostas.',
      tips:
        'Dica do dia: cotações com 5+ fornecedores diferentes economizam até 12% em média. Cadastre seus fornecedores recorrentes e o CotaObra dispara automático para a categoria certa de material.',
      case_study:
        'Construtora Aurora reduziu o ciclo de compra de 3 dias para 4 horas usando o CotaObra. O comprador recebe um quadro comparativo lado a lado e fecha com 1 clique — sem planilha, sem trocar 30 mensagens.',
      advanced_feature:
        'Sabia que o ranking de fornecedores leva em conta preço, prazo e taxa de resposta? E o pricing-engine ajusta automaticamente para a condição de pagamento (à vista vs 28/56dd) para você comparar maçãs com maçãs.',
      usage_reminder:
        'Você ainda tem cotações disponíveis no seu trial. Aproveite para testar com a próxima compra de cimento ou aço da sua obra — sem custo.',
      trial_ending:
        'Seu período de teste acaba em 2 dias. Não perca acesso ao histórico de cotações, fornecedores cadastrados e relatórios de economia — faça o upgrade agora.',
      upgrade_offer:
        'Último dia do trial! Use o código OBRA20 e ganhe 20% de desconto no plano Pro por 3 meses. Cancele quando quiser.',
    };
    return content[template] || '';
  }
}
