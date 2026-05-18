import {
  levenshtein,
  similarity,
  findFuzzyMatch,
  fuzzyMatchCity,
  _clearCityCatalogCache,
} from '../../../src/services/fuzzy-match.service';

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

beforeAll(() => {
  _clearCityCatalogCache();
});

describe('levenshtein', () => {
  it.each([
    ['', '', 0],
    ['abc', 'abc', 0],
    ['kitten', 'sitting', 3],
    ['saturday', 'sunday', 3],
    ['', 'abc', 3],
    ['abc', '', 3],
  ])('levenshtein(%s, %s) = %d', (a, b, expected) => {
    expect(levenshtein(a, b)).toBe(expected);
  });
});

describe('similarity', () => {
  it('idêntico → 1', () => {
    expect(similarity('rio verde', 'rio verde')).toBe(1);
  });

  it('totalmente diferente → 0', () => {
    expect(similarity('abc', '')).toBe(0);
  });

  it('"sup" vs "ssp" → ~0.66 (1 troca / 3 caracteres)', () => {
    expect(similarity('sup', 'ssp')).toBeCloseTo(0.6666, 2);
  });

  it('"ssp 20" vs "ssp 20%" → 0.857 (1 char extra / 7)', () => {
    expect(similarity('ssp 20', 'ssp 20%')).toBeCloseTo(0.857, 2);
  });
});

describe('findFuzzyMatch — thresholds', () => {
  const candidates = [
    { display: 'SSP 20%', normalized: 'ssp 20%' },
    { display: 'Ureia', normalized: 'ureia' },
    { display: 'NPK 10-10-10', normalized: 'npk 10-10-10' },
  ];

  it('match exato → silent score 1', () => {
    const v = findFuzzyMatch('SSP 20%', candidates);
    expect(v.kind).toBe('silent');
    if (v.kind === 'silent') {
      expect(v.value).toBe('SSP 20%');
      expect(v.score).toBe(1);
    }
  });

  it('typo pequeno (ureia → uria) → suggest 70-90%', () => {
    const v = findFuzzyMatch('uria', candidates);
    expect(v.kind).toBe('suggest');
  });

  it('totalmente diferente → unknown', () => {
    const v = findFuzzyMatch('xyz123', candidates);
    expect(v.kind).toBe('unknown');
  });

  it('input vazio → unknown', () => {
    const v = findFuzzyMatch('', candidates);
    expect(v.kind).toBe('unknown');
  });
});

describe('fuzzyMatchCity (IBGE real)', () => {
  it('"São Paulo" → silent (única em SP)', () => {
    const v = fuzzyMatchCity('São Paulo');
    expect(v.kind).toBe('silent');
    if (v.kind === 'silent') {
      expect(v.value).toContain('São Paulo');
      expect(v.value).toContain('SP');
    }
  });

  it('"sao paulo" sem acento também casa', () => {
    const v = fuzzyMatchCity('sao paulo');
    expect(v.kind).toBe('silent');
  });

  it('"Cruzeiro do Sul" tem múltiplas UFs (AC/PR/RS) → suggest com options', () => {
    const v = fuzzyMatchCity('Cruzeiro do Sul');
    expect(v.kind).toBe('suggest');
    if (v.kind === 'suggest') {
      expect((v.meta as any)?.ambiguous).toBe(true);
      expect((v.meta as any)?.options.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('"Cruzeiro do Sul" com preferUF=PR → silent (PR)', () => {
    const v = fuzzyMatchCity('Cruzeiro do Sul', 'PR');
    expect(v.kind).toBe('silent');
    if (v.kind === 'silent') {
      expect((v.meta as any).uf).toBe('PR');
    }
  });

  it('"Cruzeiro do Sul" com preferUF=AC → silent (AC)', () => {
    const v = fuzzyMatchCity('Cruzeiro do Sul', 'AC');
    expect(v.kind).toBe('silent');
    if (v.kind === 'silent') {
      expect((v.meta as any).uf).toBe('AC');
    }
  });

  it('"Rio Verde" único em GO → silent', () => {
    const v = fuzzyMatchCity('Rio Verde');
    expect(v.kind).toBe('silent');
    if (v.kind === 'silent') {
      expect((v.meta as any).uf).toBe('GO');
    }
  });

  it('cidade inventada com typo → unknown ou suggest', () => {
    const v = fuzzyMatchCity('Cidade Que Nao Existe');
    expect(['unknown', 'suggest']).toContain(v.kind);
  });

  it('typo leve "Goianai" → suggest "Goiânia"', () => {
    const v = fuzzyMatchCity('Goianai');
    expect(['silent', 'suggest']).toContain(v.kind);
    if (v.kind !== 'unknown') {
      expect(v.value.toLowerCase()).toContain('goi');
    }
  });

  it('"Rio Verde/GO" — extrai UF e desambígua quando possível', () => {
    const v = fuzzyMatchCity('Rio Verde/GO');
    expect(v.kind).toBe('silent');
    if (v.kind === 'silent') {
      expect((v.meta as any).uf).toBe('GO');
    }
  });

  it('"Cruzeiro do Sul - PR" UF do input desempata sobre múltiplos', () => {
    const v = fuzzyMatchCity('Cruzeiro do Sul - PR');
    expect(v.kind).toBe('silent');
    if (v.kind === 'silent') {
      expect((v.meta as any).uf).toBe('PR');
    }
  });

  it('"Cruzeiro do Sul, AC" formato com vírgula também funciona', () => {
    const v = fuzzyMatchCity('Cruzeiro do Sul, AC');
    expect(v.kind).toBe('silent');
    if (v.kind === 'silent') {
      expect((v.meta as any).uf).toBe('AC');
    }
  });
});
