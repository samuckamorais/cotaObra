/**
 * FEAT-PDF-001 — MinioStorage wrapper
 *
 * Testa apenas o que é local (sem mock de I/O com MinIO real):
 *  - buildQuotePdfKey: convenção de chave da §5.2
 *  - exists: trata corretamente NotFound vs erro de rede
 *
 * Os métodos `uploadPdf`, `getPresignedUrl`, `delete` delegam ao SDK
 * `minio` — testar end-to-end exige container MinIO ativo, que é o
 * job de teste de integração (não unit).
 */
jest.mock('minio', () => {
  const statObject = jest.fn();
  const putObject = jest.fn();
  const removeObject = jest.fn();
  const presignedGetObject = jest.fn();
  const bucketExists = jest.fn();
  return {
    Client: jest.fn().mockImplementation(() => ({
      statObject,
      putObject,
      removeObject,
      presignedGetObject,
      bucketExists,
    })),
    __mocks: { statObject, putObject, removeObject, presignedGetObject, bucketExists },
  };
});

jest.mock('../../../../src/config/env', () => ({
  env: {
    MINIO_INTERNAL_ENDPOINT: 'minio:9000',
    MINIO_PUBLIC_URL: 'https://minio-pdf.cotaobra.com.br',
    MINIO_ROOT_USER: 'test_user',
    MINIO_ROOT_PASSWORD: 'test_pass',
    MINIO_BUCKET: 'cotagro-quote-pdfs',
  },
}));

jest.mock('../../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { MinioStorage } from '../../../../src/services/storage/minio.storage';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const minioMocks = (require('minio') as any).__mocks;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('MinioStorage.buildQuotePdfKey', () => {
  it('segue convenção tenants/<tid>/quotes/<YYYY>/<MM>/<qid>.pdf', () => {
    const key = MinioStorage.buildQuotePdfKey('t1', 'q-abc', new Date('2026-05-14T10:00:00Z'));
    expect(key).toBe('tenants/t1/quotes/2026/05/q-abc.pdf');
  });

  it('pad zero no mês de 1 dígito', () => {
    const key = MinioStorage.buildQuotePdfKey('t1', 'q1', new Date('2026-01-14T00:00:00Z'));
    expect(key).toContain('/2026/01/');
  });

  it('default date é new Date() (smoke)', () => {
    const key = MinioStorage.buildQuotePdfKey('t1', 'q1');
    expect(key).toMatch(/^tenants\/t1\/quotes\/\d{4}\/\d{2}\/q1\.pdf$/);
  });
});

describe('MinioStorage.exists', () => {
  it('retorna true quando statObject resolve', async () => {
    minioMocks.statObject.mockResolvedValue({ size: 1024 });
    await expect(MinioStorage.exists('foo.pdf')).resolves.toBe(true);
  });

  it('retorna false quando statObject lança NotFound', async () => {
    const err = new Error('Not Found') as Error & { code: string };
    err.code = 'NotFound';
    minioMocks.statObject.mockRejectedValue(err);
    await expect(MinioStorage.exists('foo.pdf')).resolves.toBe(false);
  });

  it('retorna false para NoSuchKey também', async () => {
    const err = new Error('No Such Key') as Error & { code: string };
    err.code = 'NoSuchKey';
    minioMocks.statObject.mockRejectedValue(err);
    await expect(MinioStorage.exists('foo.pdf')).resolves.toBe(false);
  });

  it('propaga erro de rede (não confunde com NotFound)', async () => {
    const err = new Error('ECONNREFUSED') as Error & { code: string };
    err.code = 'ECONNREFUSED';
    minioMocks.statObject.mockRejectedValue(err);
    await expect(MinioStorage.exists('foo.pdf')).rejects.toThrow('ECONNREFUSED');
  });
});

describe('MinioStorage.uploadPdf', () => {
  it('chama putObject com bucket + key + buffer + content-type pdf', async () => {
    minioMocks.putObject.mockResolvedValue(undefined);
    const buf = Buffer.from('fake pdf content');
    await MinioStorage.uploadPdf('foo.pdf', buf);
    expect(minioMocks.putObject).toHaveBeenCalledWith(
      'cotagro-quote-pdfs',
      'foo.pdf',
      buf,
      buf.length,
      expect.objectContaining({ 'Content-Type': 'application/pdf' }),
    );
  });
});

describe('MinioStorage.getPresignedUrl', () => {
  it('chama presignedGetObject com bucket + key + ttl', async () => {
    minioMocks.presignedGetObject.mockResolvedValue('https://minio-pdf.../signed');
    const url = await MinioStorage.getPresignedUrl('foo.pdf', 3600);
    expect(url).toBe('https://minio-pdf.../signed');
    expect(minioMocks.presignedGetObject).toHaveBeenCalledWith(
      'cotagro-quote-pdfs',
      'foo.pdf',
      3600,
    );
  });
});

describe('MinioStorage.delete', () => {
  it('chama removeObject silenciosamente em erro (idempotente)', async () => {
    minioMocks.removeObject.mockRejectedValue(new Error('NoSuchKey'));
    await expect(MinioStorage.delete('foo.pdf')).resolves.toBeUndefined();
  });

  it('chama removeObject e retorna em sucesso', async () => {
    minioMocks.removeObject.mockResolvedValue(undefined);
    await MinioStorage.delete('foo.pdf');
    expect(minioMocks.removeObject).toHaveBeenCalledWith('cotagro-quote-pdfs', 'foo.pdf');
  });
});

describe('MinioStorage.ping', () => {
  it('true se bucket existir', async () => {
    minioMocks.bucketExists.mockResolvedValue(true);
    await expect(MinioStorage.ping()).resolves.toBe(true);
  });

  it('false em qualquer erro', async () => {
    minioMocks.bucketExists.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(MinioStorage.ping()).resolves.toBe(false);
  });
});
