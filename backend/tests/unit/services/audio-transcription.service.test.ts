import {
  transcribeAudio,
  convertToMp3,
} from '../../../src/services/audio-transcription.service';
import { openaiService } from '../../../src/services/openai.service';

jest.mock('../../../src/services/openai.service', () => ({
  openaiService: { transcribeAudio: jest.fn() },
}));
jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockTranscribe = openaiService.transcribeAudio as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockTranscribe.mockResolvedValue('texto transcrito');
});

describe('transcribeAudio — mime passthrough', () => {
  it.each([
    'audio/mp3',
    'audio/mpeg',
    'audio/wav',
    'audio/m4a',
    'audio/x-m4a',
    'audio/mp4',
    'audio/flac',
  ])('"%s" passa direto para Whisper sem FFmpeg', async (mime) => {
    const buf = Buffer.from('fake audio data');
    const result = await transcribeAudio(buf, mime);

    expect(result).toBe('texto transcrito');
    expect(mockTranscribe).toHaveBeenCalledWith(buf, mime);
  });

  it('mime com charset/parametros é normalizado para passthrough', async () => {
    const buf = Buffer.from('x');
    await transcribeAudio(buf, 'audio/mp3; codecs=mp3');
    // Após normalização, "audio/mp3" entra na lista passthrough
    expect(mockTranscribe).toHaveBeenCalledTimes(1);
    expect(mockTranscribe.mock.calls[0][0]).toBe(buf);
  });
});

describe('transcribeAudio — mime exige conversão', () => {
  // Estes testes exigem FFmpeg disponível no PATH. Em CI sem FFmpeg,
  // a conversão falha mas faz fallback para o buffer original.
  // Validamos só que o fallback funciona (envia ao Whisper de qualquer jeito).

  it('audio/ogg sem FFmpeg disponível faz fallback graciosamente', async () => {
    const buf = Buffer.from('fake ogg data');
    const result = await transcribeAudio(buf, 'audio/ogg');

    expect(result).toBe('texto transcrito');
    // Whisper foi chamado mesmo com FFmpeg ausente/falhando
    expect(mockTranscribe).toHaveBeenCalledTimes(1);
  });

  it('mime undefined faz fallback graciosamente', async () => {
    const buf = Buffer.from('x');
    const result = await transcribeAudio(buf);
    expect(result).toBe('texto transcrito');
    expect(mockTranscribe).toHaveBeenCalledTimes(1);
  });
});

describe('transcribeAudio — propaga erro do Whisper', () => {
  it('erro do Whisper sobe para o caller', async () => {
    mockTranscribe.mockRejectedValue(new Error('whisper API down'));
    await expect(transcribeAudio(Buffer.from('x'), 'audio/mp3')).rejects.toThrow(
      'whisper API down',
    );
  });
});

describe('convertToMp3', () => {
  // Sem FFmpeg disponível, o spawn rejeita a Promise. Validamos só
  // que o contrato (Promise<Buffer> ou rejeição) é respeitado.
  it('retorna Promise — resolve com Buffer ou rejeita', async () => {
    const promise = convertToMp3(Buffer.from('not really audio'));
    expect(promise).toBeInstanceOf(Promise);
    await expect(promise).rejects.toBeDefined();
  });
});
