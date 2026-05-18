import * as fs from 'fs';
import * as path from 'path';

/**
 * Testes de verificação de copy da Landing Page (FF-LP-007).
 *
 * Valida que a landing page não contém promessas que não correspondem
 * ao estado atual do produto. Lê o arquivo fonte e verifica strings.
 */

const LANDING_PATH = path.resolve(__dirname, '../../..', 'frontend/src/pages/Landing.tsx');

let landingContent: string;

beforeAll(() => {
  landingContent = fs.readFileSync(LANDING_PATH, 'utf-8');
});

describe('FF-LP-007: Copy da Landing Page', () => {
  describe('Nenhuma menção a "tempo real" ou "real-time"', () => {
    it('não contém "em tempo real" (exceto em comentários TODO)', () => {
      const lines = landingContent.split('\n');
      const violations = lines.filter(
        (line) => /tempo real|real-time/i.test(line) && !line.trim().startsWith('//') && !line.includes('TODO'),
      );
      expect(violations).toHaveLength(0);
    });
  });

  describe('Nenhuma menção a "acompanhamento automático"', () => {
    it('não contém "acompanhamento automático" nos features dos planos', () => {
      const lines = landingContent.split('\n');
      const violations = lines.filter(
        (line) => /acompanhamento automático/i.test(line) && !line.trim().startsWith('//') && !line.includes('TODO'),
      );
      expect(violations).toHaveLength(0);
    });

    it('não contém "lembretes automáticos"', () => {
      const lines = landingContent.split('\n');
      const violations = lines.filter(
        (line) => /lembretes automáticos/i.test(line) && !line.trim().startsWith('//'),
      );
      expect(violations).toHaveLength(0);
    });
  });

  describe('Nenhuma menção a "exportar" relatórios', () => {
    it('não contém "Exporte relatórios" ou "exportar"', () => {
      const lines = landingContent.split('\n');
      const violations = lines.filter(
        (line) => /exporte.*relat|exportar.*relat/i.test(line) && !line.trim().startsWith('//') && !line.includes('TODO'),
      );
      expect(violations).toHaveLength(0);
    });
  });

  describe('Badge de prova social corrigido', () => {
    it('não contém "+350 produtores"', () => {
      expect(landingContent).not.toMatch(/\+350 produtores/);
    });

    it('não contém "12 estados"', () => {
      const lines = landingContent.split('\n');
      const violations = lines.filter(
        (line) => /12 estados/i.test(line) && !line.trim().startsWith('//'),
      );
      expect(violations).toHaveLength(0);
    });

    it('contém dado qualitativo verificável', () => {
      expect(landingContent).toMatch(/Desenvolvido com produtores|agronegócio brasileiro/);
    });
  });

  describe('Suporte por plano ajustado', () => {
    it('Basic tem "WhatsApp (horário comercial)"', () => {
      expect(landingContent).toContain('WhatsApp (horário comercial)');
    });

    it('Pro tem "WhatsApp (atendimento rápido)"', () => {
      expect(landingContent).toContain('WhatsApp (atendimento rápido)');
    });

    it('Enterprise tem "WhatsApp + email"', () => {
      expect(landingContent).toContain('WhatsApp + email');
    });

    it('não contém "Suporte por email" genérico como tier', () => {
      // "Email" isolado como valor de suporte não deve existir
      const lines = landingContent.split('\n');
      const violations = lines.filter(
        (line) => /value.*'Email'/.test(line) && /Suporte/.test(line),
      );
      expect(violations).toHaveLength(0);
    });

    it('não contém "Prioritário" como valor de suporte', () => {
      const lines = landingContent.split('\n');
      const violations = lines.filter(
        (line) => /value.*'Prioritário'/.test(line),
      );
      expect(violations).toHaveLength(0);
    });

    it('não contém "Dedicado" como valor de suporte', () => {
      const lines = landingContent.split('\n');
      const violations = lines.filter(
        (line) => /value.*'Dedicado'/.test(line),
      );
      expect(violations).toHaveLength(0);
    });
  });

  describe('Garantia de reembolso mantida com link', () => {
    it('contém "Garantia de reembolso" na página', () => {
      expect(landingContent).toMatch(/[Gg]arantia de reembolso/);
    });

    it('contém link para política de reembolso', () => {
      expect(landingContent).toMatch(/política de reembolso/i);
    });
  });

  describe('Comentários TODO inseridos para tasks futuras', () => {
    it('tem TODO para FF-BE-003 (exportação)', () => {
      expect(landingContent).toContain('TODO: FF-BE-003');
    });

    it('tem TODO para FF-BE-004 (alertas automáticos)', () => {
      expect(landingContent).toContain('TODO: FF-BE-004');
    });

    it('tem TODO para FF-BE-005 (tempo real)', () => {
      expect(landingContent).toContain('TODO: FF-BE-005');
    });
  });
});
