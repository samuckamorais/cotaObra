import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { z } from 'zod';

const createLeadSchema = z.object({
  name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
  whatsapp: z.string().min(14, 'WhatsApp inválido'),
  email: z.string().email('E-mail inválido'),
  source: z.string().default('website'),
  lgpd_consent: z.boolean().refine((v) => v === true, 'Aceite da LGPD é obrigatório'),
});

export class LeadsController {
  /**
   * POST /api/leads — público, sem autenticação
   * Captura lead da landing page.
   */
  static create = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = createLeadSchema.parse(req.body);

      // Verificar duplicata por email + source
      const existing = await prisma.lead.findFirst({
        where: { email: data.email.toLowerCase(), source: data.source },
      });

      if (existing) {
        res.json({ success: true, message: 'Lead já cadastrado.' });
        return;
      }

      const lead = await prisma.lead.create({
        data: {
          name: data.name,
          whatsapp: data.whatsapp,
          email: data.email.toLowerCase(),
          source: data.source,
          lgpdConsent: data.lgpd_consent,
        },
      });

      logger.info('Lead captured', { leadId: lead.id, source: data.source, email: data.email });

      res.status(201).json({ success: true, message: 'Lead registrado com sucesso.' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: { message: 'Dados inválidos', details: error.errors },
        });
        return;
      }
      logger.error('Failed to capture lead', { error: String(error) });
      res.status(500).json({ success: false, error: { message: 'Erro ao registrar. Tente novamente.' } });
    }
  };

  /**
   * GET /api/leads — protegido, só admin
   * Lista todos os leads capturados.
   */
  static list = async (req: Request, res: Response): Promise<void> => {
    try {
      const { source, page = '1', limit = '50' } = req.query as Record<string, string>;

      const where = source ? { source } : {};
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [leads, total] = await Promise.all([
        prisma.lead.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: parseInt(limit),
        }),
        prisma.lead.count({ where }),
      ]);

      res.json({
        success: true,
        data: leads,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (error) {
      logger.error('Failed to list leads', { error: String(error) });
      res.status(500).json({ success: false, error: { message: 'Erro ao listar leads.' } });
    }
  };
}
