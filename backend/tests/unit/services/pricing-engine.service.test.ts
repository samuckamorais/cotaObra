import {
  computeCorrectedTotal,
  rankProposals,
  weightedDays,
  DEFAULT_PRICING_SETTINGS,
} from '../../../src/services/pricing-engine.service';

describe('pricing-engine (CO-4-01)', () => {
  describe('weightedDays', () => {
    it.each([
      ['à vista', 0],
      ['avista', 0],
      ['à VISTA', 0],
      ['28dd', 28],
      ['28 dias', 28],
      ['28/56dd', 42],
      ['28/56', 42],
      ['30/60/90dd', 60],
      ['30/60/90', 60],
      ['45 dias', 45],
      ['45dd', 45],
    ])('"%s" → %d dias', (input, expected) => {
      expect(weightedDays(input)).toBe(expected);
    });

    it('null/undefined/empty → 0', () => {
      expect(weightedDays(null)).toBe(0);
      expect(weightedDays(undefined)).toBe(0);
      expect(weightedDays('')).toBe(0);
    });

    it('texto livre desconhecido → fallback 30', () => {
      expect(weightedDays('parcelado boleto')).toBe(30);
      expect(weightedDays('falar com o gerente')).toBe(30);
    });

    it('parcelas customizadas calculam média', () => {
      // 15/45/75 → média = (15+45+75)/3 = 45
      expect(weightedDays('15/45/75dd')).toBe(45);
      // 7/14 → média = 10.5
      expect(weightedDays('7/14dd')).toBe(10.5);
    });
  });

  describe('computeCorrectedTotal — CIF', () => {
    it('1 item, CIF, à vista, prazo no limite — corrigido = base', () => {
      const result = computeCorrectedTotal(
        {
          items: [{ totalPrice: 1000, available: true }],
          freightMode: 'CIF',
          freightValue: 0,
          paymentTerms: 'à vista',
          deliveryDays: 5,
        },
        { deadlineDays: 5 },
      );
      expect(result.corrected.toFixed(2)).toBe('1000.00');
      expect(result.breakdown.base).toBe('1000.00');
      expect(result.breakdown.freight).toBe('0.00');
      expect(result.breakdown.financialCost).toBe('0.00');
      expect(result.breakdown.deliveryAdjustment).toBe('0.00');
    });

    it('CIF ignora freightValue mesmo se informado', () => {
      const result = computeCorrectedTotal(
        {
          items: [{ totalPrice: 1000, available: true }],
          freightMode: 'CIF',
          freightValue: 500, // ignorado
          paymentTerms: 'à vista',
          deliveryDays: 5,
        },
        { deadlineDays: 5 },
      );
      expect(result.breakdown.freight).toBe('0.00');
    });
  });

  describe('computeCorrectedTotal — FOB', () => {
    it('FOB soma freightValue ao corrigido', () => {
      const result = computeCorrectedTotal(
        {
          items: [{ totalPrice: 1000, available: true }],
          freightMode: 'FOB',
          freightValue: 250,
          paymentTerms: 'à vista',
          deliveryDays: 5,
        },
        { deadlineDays: 5 },
      );
      expect(result.breakdown.freight).toBe('250.00');
      expect(result.corrected.toFixed(2)).toBe('1250.00');
    });

    it('FOB sem freightValue → freight = 0', () => {
      const result = computeCorrectedTotal(
        {
          items: [{ totalPrice: 1000, available: true }],
          freightMode: 'FOB',
          freightValue: null,
          paymentTerms: 'à vista',
          deliveryDays: 5,
        },
        { deadlineDays: 5 },
      );
      expect(result.breakdown.freight).toBe('0.00');
    });
  });

  describe('computeCorrectedTotal — custo financeiro', () => {
    it('1000 base * 1%/mês * 30 dias / 30 = 10', () => {
      const result = computeCorrectedTotal(
        {
          items: [{ totalPrice: 1000 }],
          freightMode: 'CIF',
          paymentTerms: '30dd',
          deliveryDays: 5,
        },
        { deadlineDays: 5 },
      );
      expect(result.breakdown.financialCost).toBe('10.00');
    });

    it('28/56dd = 42 dias ponderado: 1000 * 0.01 * 42 / 30 = 14', () => {
      const result = computeCorrectedTotal(
        {
          items: [{ totalPrice: 1000 }],
          freightMode: 'CIF',
          paymentTerms: '28/56dd',
          deliveryDays: 5,
        },
        { deadlineDays: 5 },
      );
      expect(result.breakdown.financialCost).toBe('14.00');
    });

    it('30/60/90dd = 60 dias ponderado: 1000 * 0.01 * 60 / 30 = 20', () => {
      const result = computeCorrectedTotal(
        {
          items: [{ totalPrice: 1000 }],
          freightMode: 'CIF',
          paymentTerms: '30/60/90dd',
          deliveryDays: 5,
        },
        { deadlineDays: 5 },
      );
      expect(result.breakdown.financialCost).toBe('20.00');
    });

    it('settings customizado: 0.8%/mês ao invés de 1%', () => {
      const result = computeCorrectedTotal(
        {
          items: [{ totalPrice: 1000 }],
          freightMode: 'CIF',
          paymentTerms: '30dd',
          deliveryDays: 5,
        },
        { deadlineDays: 5 },
        { monthlyRate: 0.008, dailyPenalty: 0.005 },
      );
      // 1000 * 0.008 * 30 / 30 = 8
      expect(result.breakdown.financialCost).toBe('8.00');
    });
  });

  describe('computeCorrectedTotal — ajuste de prazo', () => {
    it('entrega no prazo: deliveryAdjustment = 0', () => {
      const result = computeCorrectedTotal(
        {
          items: [{ totalPrice: 1000 }],
          freightMode: 'CIF',
          paymentTerms: 'à vista',
          deliveryDays: 5,
        },
        { deadlineDays: 5 },
      );
      expect(result.breakdown.deliveryAdjustment).toBe('0.00');
    });

    it('entrega ANTES do prazo: ajuste = 0 (não premia)', () => {
      const result = computeCorrectedTotal(
        {
          items: [{ totalPrice: 1000 }],
          freightMode: 'CIF',
          paymentTerms: 'à vista',
          deliveryDays: 2,
        },
        { deadlineDays: 5 },
      );
      expect(result.breakdown.deliveryAdjustment).toBe('0.00');
    });

    it('atraso 3 dias × 0.5% × 1000 = 15', () => {
      const result = computeCorrectedTotal(
        {
          items: [{ totalPrice: 1000 }],
          freightMode: 'CIF',
          paymentTerms: 'à vista',
          deliveryDays: 8,
        },
        { deadlineDays: 5 },
      );
      expect(result.breakdown.deliveryAdjustment).toBe('15.00');
    });

    it('atraso de 1 dia com penalidade customizada 1% → 10', () => {
      const result = computeCorrectedTotal(
        {
          items: [{ totalPrice: 1000 }],
          freightMode: 'CIF',
          paymentTerms: 'à vista',
          deliveryDays: 6,
        },
        { deadlineDays: 5 },
        { monthlyRate: 0.01, dailyPenalty: 0.01 },
      );
      expect(result.breakdown.deliveryAdjustment).toBe('10.00');
    });
  });

  describe('computeCorrectedTotal — items indisponíveis', () => {
    it('item available=false não entra no base', () => {
      const result = computeCorrectedTotal(
        {
          items: [
            { totalPrice: 1000, available: true },
            { totalPrice: 500, available: false },
          ],
          freightMode: 'CIF',
          paymentTerms: 'à vista',
          deliveryDays: 5,
        },
        { deadlineDays: 5 },
      );
      expect(result.breakdown.base).toBe('1000.00');
    });

    it('available undefined considerado true (compat com cotações antigas)', () => {
      const result = computeCorrectedTotal(
        {
          items: [{ totalPrice: 1000 }, { totalPrice: 500 }],
          freightMode: 'CIF',
          paymentTerms: 'à vista',
          deliveryDays: 5,
        },
        { deadlineDays: 5 },
      );
      expect(result.breakdown.base).toBe('1500.00');
    });
  });

  describe('computeCorrectedTotal — caso completo', () => {
    it('FOB R$ 1000 + frete 100 + 28/56dd + atraso 2 dias', () => {
      // base = 1000
      // freight = 100 (FOB)
      // financialCost = 1000 * 0.01 * 42 / 30 = 14
      // deliveryAdjustment = 1000 * 0.005 * 2 = 10
      // corrected = 1124
      const result = computeCorrectedTotal(
        {
          items: [{ totalPrice: 1000 }],
          freightMode: 'FOB',
          freightValue: 100,
          paymentTerms: '28/56dd',
          deliveryDays: 7,
        },
        { deadlineDays: 5 },
      );
      expect(result.breakdown.base).toBe('1000.00');
      expect(result.breakdown.freight).toBe('100.00');
      expect(result.breakdown.financialCost).toBe('14.00');
      expect(result.breakdown.deliveryAdjustment).toBe('10.00');
      expect(result.breakdown.corrected).toBe('1124.00');
    });
  });

  describe('rankProposals', () => {
    it('ordena por correctedTotal crescente e atribui rank 1..N', () => {
      const proposals = [
        {
          items: [{ totalPrice: 1100 }],
          freightMode: 'CIF',
          paymentTerms: 'à vista',
          deliveryDays: 5,
        },
        {
          items: [{ totalPrice: 1000 }],
          freightMode: 'FOB',
          freightValue: 200,
          paymentTerms: 'à vista',
          deliveryDays: 5,
        },
        {
          items: [{ totalPrice: 1050 }],
          freightMode: 'CIF',
          paymentTerms: '28dd',
          deliveryDays: 5,
        },
      ];
      const ranked = rankProposals(proposals, { deadlineDays: 5 });
      // P1 (CIF, à vista): 1100
      // P2 (FOB +200, à vista): 1200
      // P3 (CIF, 28dd → 28*0.01/30 = 0.93%): 1050 + 9.80 = 1059.80
      expect(ranked[0].rank).toBe(1);
      expect(ranked[1].rank).toBe(2);
      expect(ranked[2].rank).toBe(3);
      // Menor corrigido vence
      expect(ranked[0].corrected.toFixed(2)).toBe('1059.80');
      expect(ranked[2].corrected.toFixed(2)).toBe('1200.00');
    });

    it('empate em corrected → rank em ordem original', () => {
      const proposals = [
        {
          items: [{ totalPrice: 1000 }],
          freightMode: 'CIF',
          paymentTerms: 'à vista',
          deliveryDays: 5,
        },
        {
          items: [{ totalPrice: 1000 }],
          freightMode: 'CIF',
          paymentTerms: 'à vista',
          deliveryDays: 5,
        },
      ];
      const ranked = rankProposals(proposals, { deadlineDays: 5 });
      expect(ranked[0].corrected.toFixed(2)).toBe(ranked[1].corrected.toFixed(2));
      expect(ranked[0].rank).toBe(1);
      expect(ranked[1].rank).toBe(2);
    });

    it('array vazio retorna array vazio', () => {
      const ranked = rankProposals([], { deadlineDays: 5 });
      expect(ranked).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('precisão decimal: 0.1 + 0.2 = 0.30 (sem erro de float)', () => {
      const result = computeCorrectedTotal(
        {
          items: [{ totalPrice: 0.1 }, { totalPrice: 0.2 }],
          freightMode: 'CIF',
          paymentTerms: 'à vista',
          deliveryDays: 5,
        },
        { deadlineDays: 5 },
      );
      expect(result.breakdown.base).toBe('0.30');
    });

    it('items vazio → corrigido = 0', () => {
      const result = computeCorrectedTotal(
        {
          items: [],
          freightMode: 'CIF',
          paymentTerms: 'à vista',
          deliveryDays: 5,
        },
        { deadlineDays: 5 },
      );
      expect(result.breakdown.corrected).toBe('0.00');
    });

    it('totalPrice como string aceitado', () => {
      const result = computeCorrectedTotal(
        {
          items: [{ totalPrice: '1234.56' }],
          freightMode: 'CIF',
          paymentTerms: 'à vista',
          deliveryDays: 5,
        },
        { deadlineDays: 5 },
      );
      expect(result.breakdown.base).toBe('1234.56');
    });

    it('DEFAULT_PRICING_SETTINGS expostos', () => {
      expect(DEFAULT_PRICING_SETTINGS.monthlyRate).toBe(0.01);
      expect(DEFAULT_PRICING_SETTINGS.dailyPenalty).toBe(0.005);
    });
  });
});
