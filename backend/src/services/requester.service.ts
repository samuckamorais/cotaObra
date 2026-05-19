import { prisma } from '../config/database';
import { tryNormalizePhoneBR } from '../utils/phone';
import { logger } from '../utils/logger';
import type { User, Site } from '@prisma/client';

/**
 * CO-2-05 — Resolver vínculo telefone → User → sites.
 *
 * Dado um número de WhatsApp recebido no webhook, identifica o solicitante
 * (User com role REQUESTER/BUYER/ADMIN) e suas obras (filtradas por siteIds
 * do user para REQUESTER; todas do tenant para BUYER/ADMIN).
 */

export interface RequesterContext {
  user: User;
  sites: Site[];
}

/**
 * Procura o User pelo número (canônico + variantes) e retorna seu contexto.
 * Retorna null se não encontrar nenhum user ativo com o número.
 */
export async function resolveRequester(
  phone: string,
): Promise<RequesterContext | null> {
  const canonical = tryNormalizePhoneBR(phone) ?? phone;
  const variants = Array.from(
    new Set([phone, canonical, phone.replace(/^\+/, ''), canonical.replace(/^\+/, '')]),
  );

  const user = await prisma.user.findFirst({
    where: {
      active: true,
      phone: { in: variants },
      role: { in: ['REQUESTER', 'BUYER', 'ADMIN', 'APPROVER'] },
    },
  });

  if (!user) {
    logger.debug('resolveRequester: phone not registered', { phone, variants });
    return null;
  }

  if (!user.tenantId) {
    logger.warn('resolveRequester: user without tenantId', { userId: user.id });
    return null;
  }

  // REQUESTER vê apenas obras em siteIds
  // BUYER/ADMIN/APPROVER vêem todas as obras do tenant
  let sites: Site[];
  if (user.role === 'REQUESTER') {
    if (!user.siteIds || user.siteIds.length === 0) {
      sites = [];
    } else {
      sites = await prisma.site.findMany({
        where: {
          tenantId: user.tenantId,
          status: 'ACTIVE',
          id: { in: user.siteIds },
        },
        orderBy: { name: 'asc' },
      });
    }
  } else {
    sites = await prisma.site.findMany({
      where: {
        tenantId: user.tenantId,
        status: 'ACTIVE',
      },
      orderBy: { name: 'asc' },
    });
  }

  return { user, sites };
}
