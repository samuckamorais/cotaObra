/**
 * Testa o enforcement do limite de fornecedores por plano no dispatch-quote.job.ts.
 *
 * O dispatch coleta fornecedores elegíveis, ordena por afinidade, e TRUNCA
 * pela capacidade do plano antes de notificar.
 *
 * A lógica de truncamento está inline no processor do Bull queue,
 * então testamos isolando a lógica core com os mesmos inputs.
 */
import { getPlanLimits } from '../../../src/config/plans';

describe('Dispatch supplier limit enforcement', () => {
  function makeSuppliers(count: number) {
    return Array.from({ length: count }, (_, i) => ({
      id: `sup-${i}`,
      isOwn: i < 3,
      supplier: {
        id: `sup-${i}`,
        name: `Fornecedor ${i}`,
        totalProposals: 10,
        acceptedProposals: 5,
        rating: 3 + (i % 3),
        categories: ['sementes'],
      },
      affinityScore: Math.random(),
    }));
  }

  function applyPlanLimit(suppliers: ReturnType<typeof makeSuppliers>, plan: string) {
    const planLimits = getPlanLimits(plan);
    const maxSuppliers = planLimits.suppliersPerQuote;
    return isFinite(maxSuppliers) ? suppliers.slice(0, maxSuppliers) : suppliers;
  }

  describe('Plano BASIC (limite: 5)', () => {
    it('trunca 8 fornecedores elegíveis para 5', () => {
      const suppliers = makeSuppliers(8);
      const limited = applyPlanLimit(suppliers, 'BASIC');
      expect(limited).toHaveLength(5);
    });

    it('mantém 3 fornecedores se há menos que o limite', () => {
      const suppliers = makeSuppliers(3);
      const limited = applyPlanLimit(suppliers, 'BASIC');
      expect(limited).toHaveLength(3);
    });

    it('mantém exatamente 5 se há exatamente 5', () => {
      const suppliers = makeSuppliers(5);
      const limited = applyPlanLimit(suppliers, 'BASIC');
      expect(limited).toHaveLength(5);
    });

    it('não adiciona o 6o fornecedor', () => {
      const suppliers = makeSuppliers(6);
      const limited = applyPlanLimit(suppliers, 'BASIC');
      expect(limited).toHaveLength(5);
      expect(limited.some(s => s.id === 'sup-5')).toBe(false);
    });
  });

  describe('Plano PRO (limite: 10)', () => {
    it('trunca 15 fornecedores elegíveis para 10', () => {
      const suppliers = makeSuppliers(15);
      const limited = applyPlanLimit(suppliers, 'PRO');
      expect(limited).toHaveLength(10);
    });

    it('não adiciona o 11o fornecedor', () => {
      const suppliers = makeSuppliers(11);
      const limited = applyPlanLimit(suppliers, 'PRO');
      expect(limited).toHaveLength(10);
      expect(limited.some(s => s.id === 'sup-10')).toBe(false);
    });

    it('mantém 7 se há menos que o limite', () => {
      const suppliers = makeSuppliers(7);
      const limited = applyPlanLimit(suppliers, 'PRO');
      expect(limited).toHaveLength(7);
    });
  });

  describe('Plano ENTERPRISE (sem limite)', () => {
    it('mantém todos os 20 fornecedores', () => {
      const suppliers = makeSuppliers(20);
      const limited = applyPlanLimit(suppliers, 'ENTERPRISE');
      expect(limited).toHaveLength(20);
    });

    it('mantém todos os 50 fornecedores', () => {
      const suppliers = makeSuppliers(50);
      const limited = applyPlanLimit(suppliers, 'ENTERPRISE');
      expect(limited).toHaveLength(50);
    });

    it('mantém 1 fornecedor sem problemas', () => {
      const suppliers = makeSuppliers(1);
      const limited = applyPlanLimit(suppliers, 'ENTERPRISE');
      expect(limited).toHaveLength(1);
    });
  });

  describe('Fallback para plano desconhecido', () => {
    it('aplica limite BASIC (5) para plano não reconhecido', () => {
      const suppliers = makeSuppliers(8);
      const limited = applyPlanLimit(suppliers, 'INEXISTENTE');
      expect(limited).toHaveLength(5);
    });
  });

  describe('Edge cases', () => {
    it('retorna array vazio se não há fornecedores', () => {
      const suppliers = makeSuppliers(0);
      const limited = applyPlanLimit(suppliers, 'BASIC');
      expect(limited).toHaveLength(0);
    });

    it('preserva ordem original (primeiros N são mantidos)', () => {
      const suppliers = makeSuppliers(8);
      // Marcar os primeiros para verificar que são eles que permanecem
      suppliers[0]!.id = 'first';
      suppliers[4]!.id = 'fifth';
      suppliers[5]!.id = 'sixth-should-be-cut';

      const limited = applyPlanLimit(suppliers, 'BASIC');
      expect(limited[0]!.id).toBe('first');
      expect(limited[4]!.id).toBe('fifth');
      expect(limited.some(s => s.id === 'sixth-should-be-cut')).toBe(false);
    });

    it('plano case-insensitive funciona no truncamento', () => {
      const suppliers = makeSuppliers(8);
      expect(applyPlanLimit(suppliers, 'basic')).toHaveLength(5);
      expect(applyPlanLimit(suppliers, 'Basic')).toHaveLength(5);
      expect(applyPlanLimit(suppliers, 'pro')).toHaveLength(8); // 8 < 10, sem corte
      expect(applyPlanLimit(suppliers, 'Pro')).toHaveLength(8);
    });
  });
});
