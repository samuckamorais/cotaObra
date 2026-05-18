/**
 * FEAT-PDF-001 — enqueueQuotePdfJob (feature flag + idempotência)
 *
 * Foco do teste unit:
 *   - Quando PDF_GENERATION_ENABLED=false, NÃO enfileira (§14.4) e
 *     registra pdf_generation_skipped
 *   - Quando habilitado, enfileira com jobId determinístico
 *   - Reenvio usa jobId único (timestamp suffix)
 *   - Falha no add() do Bull não derruba o caller (try/catch)
 *
 * O processor real e os eventos de retry são testados na integração
 * (fora do escopo unit; cobertos pelo §14.6 da spec).
 */
jest.mock('../../../src/jobs/queue.config', () => ({
  quotePdfQueue: { add: jest.fn(), process: jest.fn(), on: jest.fn() },
}));

jest.mock('../../../src/services/fsm-event.service', () => ({
  FSMEventService: { track: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  logWithContext: jest.fn(),
}));

jest.mock('../../../src/config/database', () => ({
  prisma: {},
}));

jest.mock('../../../src/services/pdf-generation.service', () => ({
  PdfGenerationService: { buildFilename: jest.fn(), generateQuoteResultPdf: jest.fn() },
}));

jest.mock('../../../src/services/storage/minio.storage', () => ({
  MinioStorage: { exists: jest.fn(), uploadPdf: jest.fn(), getPresignedUrl: jest.fn(), buildQuotePdfKey: jest.fn() },
}));

jest.mock('../../../src/modules/whatsapp/whatsapp.service', () => ({
  whatsappService: { sendMessage: jest.fn(), sendDocument: jest.fn() },
}));

// Mock env com flag controlável por teste
const mockEnv: { PDF_GENERATION_ENABLED: boolean; FRONTEND_URL: string; PDF_PRESIGN_TTL_DAYS: number } = {
  PDF_GENERATION_ENABLED: true,
  FRONTEND_URL: 'https://cotaobra.com.br',
  PDF_PRESIGN_TTL_DAYS: 7,
};
jest.mock('../../../src/config/env', () => ({
  env: new Proxy({}, { get: (_t, p: string) => (mockEnv as Record<string, unknown>)[p] }),
}));

import { enqueueQuotePdfJob } from '../../../src/jobs/generate-quote-pdf.job';
import { quotePdfQueue } from '../../../src/jobs/queue.config';
import { FSMEventService } from '../../../src/services/fsm-event.service';

const mockAdd = quotePdfQueue.add as jest.Mock;
const mockTrack = FSMEventService.track as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockEnv.PDF_GENERATION_ENABLED = true;
});

describe('enqueueQuotePdfJob — feature flag (§14.4)', () => {
  it('quando PDF_GENERATION_ENABLED=false, NÃO chama queue.add e registra pdf_generation_skipped', async () => {
    mockEnv.PDF_GENERATION_ENABLED = false;

    await enqueueQuotePdfJob({
      quoteId: 'q1',
      tenantId: 't1',
      producerId: 'p1',
      producerPhone: '+5564999999999',
    });

    expect(mockAdd).not.toHaveBeenCalled();
    expect(mockTrack).toHaveBeenCalledWith(
      expect.objectContaining({
        producerId: 'p1',
        eventType: 'pdf_generation_skipped',
        payload: expect.objectContaining({ quoteId: 'q1', reason: 'feature_flag_off' }),
      }),
    );
  });

  it('quando habilitado, chama queue.add com jobId determinístico', async () => {
    await enqueueQuotePdfJob({
      quoteId: 'q1',
      tenantId: 't1',
      producerId: 'p1',
      producerPhone: '+5564999999999',
    });

    expect(mockAdd).toHaveBeenCalledTimes(1);
    const [data, opts] = mockAdd.mock.calls[0];
    expect(data).toMatchObject({ quoteId: 'q1', tenantId: 't1' });
    expect(opts.jobId).toBe('pdf:q1');
  });

  it('reenvio (resent=true) usa jobId único com timestamp', async () => {
    await enqueueQuotePdfJob({
      quoteId: 'q1',
      tenantId: 't1',
      producerId: 'p1',
      producerPhone: '+5564999999999',
      resent: true,
    });

    const [, opts] = mockAdd.mock.calls[0];
    expect(opts.jobId).toMatch(/^pdf:q1:\d+$/);
  });
});

describe('enqueueQuotePdfJob — robustez', () => {
  it('AC-06: falha de enqueue NÃO derruba o caller', async () => {
    mockAdd.mockRejectedValueOnce(new Error('Redis down'));

    await expect(
      enqueueQuotePdfJob({
        quoteId: 'q1',
        tenantId: 't1',
        producerId: 'p1',
        producerPhone: '+5564999999999',
      }),
    ).resolves.toBeUndefined();
  });
});
