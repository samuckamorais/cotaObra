import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { SupplierScope } from '@prisma/client';

const { Decimal } = Prisma;

export type WinnerNotificationType = 'SELECTED' | 'PRODUCER_WILL_CONTACT' | 'NONE';

export interface TenantSettingsData {
  proposalLinkExpiryHours: number;
  quoteDeadlineDays: number;
  defaultSupplierScope: SupplierScope;
  maxItemsPerQuote: number;
  winnerNotificationType: WinnerNotificationType;
  quoteExpiryHours: number;
  /** CO-6-05: teto acima do qual fechamentos exigem aprovação. null = sem teto. */
  approvalThreshold: number | null;
}

const DEFAULTS: Omit<TenantSettingsData, 'approvalThreshold'> = {
  proposalLinkExpiryHours: 24,
  quoteDeadlineDays: 3,
  // 'MINE' enquanto ENABLE_NETWORK_SUPPLIERS=false (lançamento sem rede ativa).
  // Reativar a rede → alterar para 'ALL' para novos tenants verem a pergunta
  // de escopo no fluxo WhatsApp.
  defaultSupplierScope: 'MINE',
  maxItemsPerQuote: 10,
  winnerNotificationType: 'NONE',
  quoteExpiryHours: 2,
};

export class TenantSettingsService {
  /**
   * Retorna as configurações do tenant, criando com valores padrão se não existir.
   * (CO-0-04: settings migraram de Producer para Tenant — agora são compartilhadas
   *  por todos os usuários da mesma construtora.)
   */
  static async getOrCreate(tenantId: string): Promise<TenantSettingsData> {
    const settings = await prisma.tenantSettings.upsert({
      where: { tenantId },
      create: { tenantId, ...DEFAULTS },
      update: {},
    });

    return {
      proposalLinkExpiryHours: settings.proposalLinkExpiryHours,
      quoteDeadlineDays: settings.quoteDeadlineDays,
      defaultSupplierScope: settings.defaultSupplierScope,
      maxItemsPerQuote: settings.maxItemsPerQuote,
      winnerNotificationType:
        (settings.winnerNotificationType as WinnerNotificationType) ?? 'NONE',
      quoteExpiryHours: settings.quoteExpiryHours ?? 2,
      approvalThreshold: settings.approvalThreshold ? Number(settings.approvalThreshold) : null,
    };
  }

  /**
   * Atualiza as configurações do tenant (upsert).
   */
  static async update(
    tenantId: string,
    data: Partial<TenantSettingsData>,
  ): Promise<TenantSettingsData> {
    const { approvalThreshold, ...rest } = data;
    const toWrite: Prisma.TenantSettingsUpdateInput = { ...rest };
    if (approvalThreshold !== undefined) {
      toWrite.approvalThreshold =
        approvalThreshold === null ? null : new Decimal(approvalThreshold);
    }

    const settings = await prisma.tenantSettings.upsert({
      where: { tenantId },
      create: {
        tenantId,
        ...DEFAULTS,
        ...rest,
        ...(approvalThreshold !== undefined
          ? {
              approvalThreshold:
                approvalThreshold === null ? null : new Decimal(approvalThreshold),
            }
          : {}),
      },
      update: toWrite,
    });

    return {
      proposalLinkExpiryHours: settings.proposalLinkExpiryHours,
      quoteDeadlineDays: settings.quoteDeadlineDays,
      defaultSupplierScope: settings.defaultSupplierScope,
      maxItemsPerQuote: settings.maxItemsPerQuote,
      winnerNotificationType:
        (settings.winnerNotificationType as WinnerNotificationType) ?? 'NONE',
      quoteExpiryHours: settings.quoteExpiryHours ?? 2,
      approvalThreshold: settings.approvalThreshold ? Number(settings.approvalThreshold) : null,
    };
  }
}
