/**
 * FEAT-PDF-001 — QuotePdfController
 *
 * Foco do unit:
 *  - Permission gate (§14.2): SUPER_ADMIN/ADMIN passam direto;
 *    USER só vê próprio Producer
 *  - download: gera PDF on-demand quando MinIO não tem objeto, e
 *    redireciona pra presigned URL
 *  - resend: valida status CLOSED, enfileira job com resent=true
 *  - Cenário 5: tenant errado → 404 (não 403, não vaza existência)
 */
jest.mock('../../../../src/services/storage/minio.storage', () => ({
  MinioStorage: {
    buildQuotePdfKey: jest.fn((t: string, q: string) => `tenants/${t}/quotes/2026/05/${q}.pdf`),
    exists: jest.fn(),
    uploadPdf: jest.fn(),
    getPresignedUrl: jest.fn(),
  },
}));

jest.mock('../../../../src/services/pdf-generation.service', () => ({
  PdfGenerationService: {
    generateQuoteResultPdf: jest.fn(),
    buildFilename: jest.fn((id: string) => `cotacao_${id.slice(0, 8)}_2026-05-14.pdf`),
  },
}));

jest.mock('../../../../src/jobs/generate-quote-pdf.job', () => ({
  enqueueQuotePdfJob: jest.fn(),
}));

jest.mock('../../../../src/config/database', () => ({
  prisma: { quote: { findFirst: jest.fn() } },
}));

jest.mock('../../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../../src/config/env', () => ({
  env: { PDF_PRESIGN_TTL_DAYS: 7, FRONTEND_URL: 'https://cotaobra.com.br' },
}));

import { QuotePdfController } from '../../../../src/modules/quotes/quote-pdf.controller';
import { MinioStorage } from '../../../../src/services/storage/minio.storage';
import { PdfGenerationService } from '../../../../src/services/pdf-generation.service';
import { enqueueQuotePdfJob } from '../../../../src/jobs/generate-quote-pdf.job';
import { prisma } from '../../../../src/config/database';

const mockExists = MinioStorage.exists as jest.Mock;
const mockGetUrl = MinioStorage.getPresignedUrl as jest.Mock;
const mockUpload = MinioStorage.uploadPdf as jest.Mock;
const mockGenerate = PdfGenerationService.generateQuoteResultPdf as jest.Mock;
const mockEnqueue = enqueueQuotePdfJob as jest.Mock;
const mockFindQuote = prisma.quote.findFirst as jest.Mock;

const buildRes = () => {
  const res: Record<string, jest.Mock> = {};
  res.setHeader = jest.fn();
  res.redirect = jest.fn();
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as unknown as import('express').Response;
};

const buildReq = (params: {
  id: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'USER';
  tenantId?: string;
  producerId?: string;
}): import('express').Request => {
  const user: Record<string, unknown> = {
    id: 'u1',
    email: 'u@b',
    role: params.role,
    tenantId: params.tenantId ?? 't1',
    producerId: params.producerId ?? null,
  };
  return { params: { id: params.id }, user } as unknown as import('express').Request;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUrl.mockResolvedValue('https://minio-pdf.../signed-url');
});

/**
 * O ErrorHandler.asyncHandler wrappa async handlers em uma função
 * síncrona (retorna void). await em método retorna imediatamente —
 * mas a Promise interna ainda está pendente. Esse helper drena o
 * microtask queue para os mocks já terem sido chamados.
 */
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('QuotePdfController.download — happy path', () => {
  it('ADMIN: redireciona 302 com X-Filename quando PDF já existe', async () => {
    mockExists.mockResolvedValue(true);
    const req = buildReq({ id: 'q-abc12345', role: 'ADMIN' });
    const res = buildRes();
    const next = jest.fn();

    QuotePdfController.download(req, res, next);
    await flush();

    expect(mockExists).toHaveBeenCalled();
    expect(mockGenerate).not.toHaveBeenCalled(); // não regerou
    expect(res.setHeader).toHaveBeenCalledWith(
      'X-Filename',
      expect.stringMatching(/^cotacao_q-abc123_/),
    );
    expect(res.redirect).toHaveBeenCalledWith(302, 'https://minio-pdf.../signed-url');
  });

  it('gera on-demand quando objeto não existe no MinIO', async () => {
    mockExists.mockResolvedValue(false);
    mockGenerate.mockResolvedValue({ buffer: Buffer.from('pdf'), filename: 'x.pdf' });
    const req = buildReq({ id: 'q-abc12345', role: 'ADMIN' });
    const res = buildRes();
    const next = jest.fn();

    QuotePdfController.download(req, res, next);
    await flush();

    expect(mockGenerate).toHaveBeenCalledWith({ tenantId: 't1', quoteId: 'q-abc12345' });
    expect(mockUpload).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(302, expect.any(String));
  });
});

describe('QuotePdfController.download — permission gate (§14.2)', () => {
  it('SUPER_ADMIN passa direto, mesmo sem producerId', async () => {
    mockExists.mockResolvedValue(true);
    const req = buildReq({ id: 'q-abc12345', role: 'SUPER_ADMIN' });
    const res = buildRes();
    const next = jest.fn();

    QuotePdfController.download(req, res, next);
    await flush();
    expect(res.redirect).toHaveBeenCalled();
    expect(mockFindQuote).not.toHaveBeenCalled(); // sem verificação de Producer
  });

  it('USER com producerId do dono passa', async () => {
    mockExists.mockResolvedValue(true);
    mockFindQuote.mockResolvedValue({ producerId: 'p1' });
    const req = buildReq({ id: 'q-abc12345', role: 'USER', producerId: 'p1' });
    const res = buildRes();
    const next = jest.fn();

    QuotePdfController.download(req, res, next);
    await flush();
    expect(res.redirect).toHaveBeenCalled();
  });

  it('USER de outro producer → 404 (não 403 — Cenário 5)', async () => {
    mockExists.mockResolvedValue(true);
    mockFindQuote.mockResolvedValue({ producerId: 'p-do-outro' });
    const req = buildReq({ id: 'q-abc12345', role: 'USER', producerId: 'p1' });
    const res = buildRes();
    const next = jest.fn();

    QuotePdfController.download(req, res, next);
    await flush();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/não encontrada/i),
      }),
    );
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it('USER sem producerId → 403', async () => {
    mockExists.mockResolvedValue(true);
    const req = buildReq({ id: 'q-abc12345', role: 'USER' /* sem producerId */ });
    const res = buildRes();
    const next = jest.fn();

    QuotePdfController.download(req, res, next);
    await flush();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/vinculado a um produtor/),
      }),
    );
  });
});

describe('QuotePdfController.resend', () => {
  beforeEach(() => {
    mockFindQuote.mockResolvedValue({
      id: 'q-abc12345',
      status: 'CLOSED',
      producer: { id: 'p1', phone: '+5564999999999' },
      producerId: 'p1',
    });
  });

  it('enfileira com resent=true em cotação CLOSED', async () => {
    const req = buildReq({ id: 'q-abc12345', role: 'ADMIN' });
    const res = buildRes();
    const next = jest.fn();

    QuotePdfController.resend(req, res, next);
    await flush();

    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        quoteId: 'q-abc12345',
        tenantId: 't1',
        producerId: 'p1',
        producerPhone: '+5564999999999',
        resent: true,
      }),
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
  });

  it('400 quando cotação não está CLOSED', async () => {
    mockFindQuote.mockResolvedValue({
      id: 'q-abc12345',
      status: 'PENDING',
      producer: { id: 'p1', phone: '+5564999999999' },
      producerId: 'p1',
    });
    const req = buildReq({ id: 'q-abc12345', role: 'ADMIN' });
    const res = buildRes();
    const next = jest.fn();

    QuotePdfController.resend(req, res, next);
    await flush();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/cota.+fechada/i),
      }),
    );
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('USER de outro producer → 404 sem enfileirar', async () => {
    mockFindQuote
      .mockResolvedValueOnce({ producerId: 'p-do-outro' }) // assertPermission
      .mockResolvedValueOnce({ producerId: 'p-do-outro', status: 'CLOSED' });
    const req = buildReq({ id: 'q-abc12345', role: 'USER', producerId: 'p1' });
    const res = buildRes();
    const next = jest.fn();

    QuotePdfController.resend(req, res, next);
    await flush();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringMatching(/não encontrada/i) }),
    );
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});
