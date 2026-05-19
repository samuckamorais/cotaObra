import { Queue, Job } from 'bull';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import {
  generatePurchaseOrderPdf,
  type PurchaseOrderPdfData,
} from '../templates/purchase-order-pdf.template';
import { PurchaseOrderService } from '../modules/purchase-orders/purchase-order.service';
import { Client } from 'minio';

/**
 * CO-5-05 — Job assíncrono que gera o PDF da OC e faz upload pro MinIO.
 *
 * Path no MinIO: `purchase-orders/{tenantId}/{poId}.pdf`
 * Após upload, atualiza `PurchaseOrder.pdfUrl` (presigned, TTL configurável)
 * e marca status como EMITTED.
 *
 * Retry: 3x com backoff exponencial. Bull + Redis (já no stack).
 */

// Bull queue lazy-init (compartilha conexão Redis do env)
let queue: Queue<{ purchaseOrderId: string }> | null = null;

function getQueue() {
  if (queue) return queue;
  const Bull = require('bull') as typeof import('bull');
  queue = new Bull('generate-po-pdf', env.REDIS_URL, {
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    },
  });
  queue.process(processPurchaseOrderPdfJob);
  return queue;
}

// MinIO client compartilhado
function getMinioClient(): Client {
  const endpoint = env.MINIO_INTERNAL_ENDPOINT.replace(/^https?:\/\//, '');
  const [host, port] = endpoint.split(':');
  return new Client({
    endPoint: host,
    port: port ? parseInt(port, 10) : 9000,
    useSSL: env.MINIO_INTERNAL_ENDPOINT.startsWith('https'),
    accessKey: env.MINIO_ROOT_USER ?? 'minioadmin',
    secretKey: env.MINIO_ROOT_PASSWORD ?? 'minioadmin',
  });
}

/**
 * Enfileira a geração do PDF.
 */
export async function enqueuePurchaseOrderPdfJob(purchaseOrderId: string): Promise<void> {
  await getQueue().add({ purchaseOrderId });
  logger.info('po_pdf.enqueued', { purchaseOrderId });
}

/**
 * Processor — chamado pelo Bull worker.
 */
export async function processPurchaseOrderPdfJob(
  job: Job<{ purchaseOrderId: string }>,
): Promise<void> {
  const { purchaseOrderId } = job.data;
  logger.info('po_pdf.processing', { purchaseOrderId, attempt: job.attemptsMade + 1 });

  // Carrega PO + relations
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    include: {
      items: true,
      supplier: true,
      quote: {
        include: {
          site: true,
        },
      },
      tenant: { select: { name: true, cnpj: true, email: true } },
    },
  });
  if (!po) throw new Error(`PO ${purchaseOrderId} não encontrada`);
  if (!po.quote.site) {
    throw new Error(`PO ${purchaseOrderId} sem Site associado (Quote.siteId nulo)`);
  }

  const data: PurchaseOrderPdfData = {
    tenant: po.tenant,
    site: po.quote.site,
    supplier: po.supplier,
    quote: {
      id: po.quote.id,
      deadline: po.quote.deadline,
      observations: po.quote.observations,
    },
    purchaseOrder: {
      id: po.id,
      number: po.number,
      totalValue: po.totalValue,
      paymentTerms: po.paymentTerms,
      deliveryDays: po.deliveryDays,
      freightMode: po.freightMode,
      freightValue: po.freightValue,
      observations: po.observations,
      createdAt: po.createdAt,
    },
    items: po.items,
  };

  const pdfBuffer = await generatePurchaseOrderPdf(data);

  // Upload pro MinIO
  const path = `purchase-orders/${po.tenantId}/${po.id}.pdf`;
  const minio = getMinioClient();

  // Garante bucket
  const bucket = env.MINIO_BUCKET;
  const exists = await minio.bucketExists(bucket).catch(() => false);
  if (!exists) {
    await minio.makeBucket(bucket, 'us-east-1');
  }

  await minio.putObject(bucket, path, pdfBuffer, pdfBuffer.length, {
    'Content-Type': 'application/pdf',
    'x-amz-meta-purchase-order-id': po.id,
  });

  // Presigned URL — TTL configurável (default 7 dias)
  const ttlSec = (env.PDF_PRESIGN_TTL_DAYS ?? 7) * 24 * 60 * 60;
  const presignedUrl = await minio.presignedGetObject(bucket, path, ttlSec);

  // Atualiza PO
  await PurchaseOrderService.setPdfUrl(po.id, presignedUrl, path);

  logger.info('po_pdf.completed', { purchaseOrderId, path });
}
