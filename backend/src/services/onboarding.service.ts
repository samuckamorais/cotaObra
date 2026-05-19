import { prisma } from '../config/database';

interface OnboardingStep {
  key: string;
  label: string;
  description: string;
  done: boolean;
  cta: { label: string; href: string };
}

export interface OnboardingProgressV2 {
  steps: OnboardingStep[];
  completed: number;
  total: number;
  percent: number;
  done: boolean;
  completedAt?: string;
}

export class OnboardingService {
  /**
   * CO-7-05 — Onboarding checklist por tenant (CotaObra).
   *
   * Steps:
   *   1. signup         — tenant criado (sempre true)
   *   2. firstSite      — pelo menos 1 obra
   *   3. firstSupplier  — pelo menos 1 fornecedor
   *   4. firstMaterial  — material catalogado OU CSV importado
   *   5. firstQuote     — pelo menos 1 cotação criada
   *   6. firstProposal  — pelo menos 1 proposta recebida
   *   7. firstPO        — pelo menos 1 Ordem de Compra emitida
   */
  static async getProgress(tenantId: string): Promise<OnboardingProgressV2> {
    const [
      sitesCount,
      suppliersCount,
      materialsCount,
      quotesCount,
      proposalsCount,
      poCount,
    ] = await Promise.all([
      prisma.site.count({ where: { tenantId } }),
      prisma.supplier.count({ where: { tenantId } }),
      prisma.material.count({ where: { tenantId } }),
      prisma.quote.count({ where: { tenantId } }),
      prisma.proposal.count({ where: { tenantId } }),
      prisma.purchaseOrder.count({ where: { tenantId } }),
    ]);

    const steps: OnboardingStep[] = [
      {
        key: 'signup',
        label: 'Conta criada',
        description: 'Sua construtora foi cadastrada no CotaObra.',
        done: true,
        cta: { label: 'Configurações', href: '/settings' },
      },
      {
        key: 'firstSite',
        label: 'Cadastre a 1ª obra',
        description: 'Cada cotação é vinculada a uma obra para rastrear gasto.',
        done: sitesCount > 0,
        cta: { label: 'Cadastrar obra', href: '/sites' },
      },
      {
        key: 'firstSupplier',
        label: 'Cadastre fornecedores',
        description: 'Para cotar, o sistema precisa saber para quem mandar.',
        done: suppliersCount > 0,
        cta: { label: 'Adicionar fornecedor', href: '/suppliers' },
      },
      {
        key: 'firstMaterial',
        label: 'Importe seu catálogo',
        description: 'Suba seu CSV de materiais ou cadastre manualmente.',
        done: materialsCount > 0,
        cta: { label: 'Importar materiais', href: '/materials' },
      },
      {
        key: 'firstQuote',
        label: 'Crie a 1ª cotação',
        description: 'Selecione itens, prazo e dispare via WhatsApp.',
        done: quotesCount > 0,
        cta: { label: 'Nova cotação', href: '/quotes' },
      },
      {
        key: 'firstProposal',
        label: 'Receba a 1ª proposta',
        description: 'Quando fornecedores responderem aparecem aqui.',
        done: proposalsCount > 0,
        cta: { label: 'Ver cotações', href: '/quotes' },
      },
      {
        key: 'firstPO',
        label: 'Feche a 1ª Ordem de Compra',
        description: 'Compare propostas e gere a OC com PDF.',
        done: poCount > 0,
        cta: { label: 'Ver OCs', href: '/purchase-orders' },
      },
    ];

    const completed = steps.filter((s) => s.done).length;
    const total = steps.length;
    const done = completed === total;

    return {
      steps,
      completed,
      total,
      percent: Math.round((completed / total) * 100),
      done,
      completedAt: done ? new Date().toISOString() : undefined,
    };
  }
}
