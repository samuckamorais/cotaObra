import { spawn } from 'child_process';
import { logger } from '../utils/logger';
import { openaiService } from './openai.service';

/**
 * FF-BE-020 — Transcrição de áudio do WhatsApp via Whisper.
 *
 * WhatsApp entrega áudio em OPUS dentro de container OGG. O Whisper
 * aceita .ogg, mas em produção o time relatou casos de codec mismatch
 * (cicatriz documentada na ata de grooming 08/05/2026). Esta camada:
 *
 *   1. Detecta o mime type / extensão do áudio.
 *   2. Se já é um formato confiável (mp3/wav/m4a), passa direto.
 *   3. Caso contrário (ogg/opus/desconhecido), converte para MP3
 *      via FFmpeg (precisa estar no container — instalado pelo
 *      Dockerfile do runner).
 *   4. Envia para OpenAI Whisper.
 *
 * Erros de conversão FFmpeg fazem fallback para envio do buffer
 * original (Whisper costuma aceitar ogg sem problema). Se Whisper
 * também falhar, propaga o erro — caller deve mostrar mensagem
 * educativa pedindo texto.
 */

const FFMPEG_TIMEOUT_MS = 15_000;
const PASSTHROUGH_MIMES = new Set([
  'audio/mp3',
  'audio/mpeg',
  'audio/mpga',
  'audio/wav',
  'audio/m4a',
  'audio/x-m4a',
  'audio/mp4',
  'audio/flac',
]);

/**
 * Converte áudio arbitrário para MP3 via pipe stdin → ffmpeg → stdout.
 * Bitrate baixo (64k mono) para reduzir tempo de upload ao Whisper.
 */
export function convertToMp3(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const args = [
      '-hide_banner',
      '-loglevel', 'error',
      '-i', 'pipe:0',
      '-vn',                  // descarta vídeo se houver
      '-ac', '1',             // mono
      '-ar', '16000',         // sample rate 16kHz (suficiente p/ voz)
      '-codec:a', 'libmp3lame',
      '-b:a', '64k',
      '-f', 'mp3',
      'pipe:1',
    ];

    const ffmpeg = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    let stderr = '';

    const timer = setTimeout(() => {
      ffmpeg.kill('SIGKILL');
      reject(new Error(`FFmpeg timeout após ${FFMPEG_TIMEOUT_MS}ms`));
    }, FFMPEG_TIMEOUT_MS);

    ffmpeg.stdout.on('data', (c: Buffer) => chunks.push(c));
    ffmpeg.stderr.on('data', (c: Buffer) => {
      stderr += c.toString();
    });

    ffmpeg.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    ffmpeg.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr.trim()}`));
      }
    });

    ffmpeg.stdin.write(input);
    ffmpeg.stdin.end();
  });
}

/**
 * Transcreve um buffer de áudio para texto. Tenta otimizar via
 * conversão pra MP3 quando o mime indicar OPUS/OGG ou for desconhecido.
 */
export async function transcribeAudio(audioBuffer: Buffer, mimeType?: string): Promise<string> {
  const normalizedMime = (mimeType ?? '').toLowerCase().split(';')[0].trim();
  const isPassthrough = normalizedMime && PASSTHROUGH_MIMES.has(normalizedMime);

  let bufferForWhisper = audioBuffer;
  let outMime = normalizedMime || 'audio/ogg';

  if (!isPassthrough) {
    try {
      logger.info('Converting audio via FFmpeg', { inputMime: normalizedMime });
      bufferForWhisper = await convertToMp3(audioBuffer);
      outMime = 'audio/mp3';
    } catch (err) {
      logger.warn('FFmpeg conversion failed, falling back to original buffer', { err });
      // Continua com o buffer original — Whisper pode aceitar ogg
    }
  }

  return openaiService.transcribeAudio(bufferForWhisper, outMime);
}
