import { Request, Response } from 'express';
import { z } from 'zod';
import {
  QuoteFormService,
  QuoteFormSupplierConflictError,
  QuoteFormValidationError,
} from './quote-form.service';
import { ErrorHandler } from '../../utils/error-handler';
import { logger } from '../../utils/logger';
import { normalizeCategoryName } from '../../utils/category-normalizer';

const createSupplierSchema = z.object({
  name: z.string().min(2, 'Informe um nome com pelo menos 2 caracteres'),
  phone: z.string().min(10, 'Informe o telefone com DDD (ex: 64999990000)'),
  category: z.string().min(2).transform(normalizeCategoryName).optional(),
});

const submitSchema = z.object({
  category: z.string().min(2, 'Informe a categoria').transform(normalizeCategoryName),
  items: z
    .array(
      z.object({
        product: z.string().min(2, 'Nome do produto muito curto'),
        quantity: z.number().positive('Quantidade deve ser maior que zero'),
        unit: z.string().min(1, 'Informe a unidade'),
        observation: z.string().optional(),
        activeIngredient: z.string().optional(),
      })
    )
    .min(1, 'Adicione ao menos um item'),
  region: z.string().min(2, 'Informe a região de entrega'),
  deadline: z.string().min(1, 'Informe o prazo'),
  observations: z.string().optional(),
  freight: z.enum(['CIF', 'FOB'], { errorMap: () => ({ message: 'Selecione CIF ou FOB' }) }),
  paymentTerms: z.string().min(2, 'Informe a condição de pagamento'),
  selectedSupplierIds: z.array(z.string()).min(1, 'Selecione ao menos um fornecedor'),
});

const TOKEN_ERROR_MESSAGES: Record<string, string> = {
  TOKEN_NOT_FOUND: 'Link inválido ou expirado.',
  TOKEN_CANCELLED: 'Esta cotação foi cancelada pelo WhatsApp.',
  TOKEN_ALREADY_USED: 'Esta cotação já foi enviada.',
  TOKEN_EXPIRED: 'Este link expirou. Solicite um novo pelo WhatsApp.',
};

export class QuoteFormController {
  /**
   * GET /api/cotacao/:token
   * Retorna dados do formulário de cotação (público)
   */
  static getForm = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { token } = req.params;

    let data;
    try {
      data = await QuoteFormService.getFormData(token);
    } catch (err: any) {
      res.status(410).json({
        success: false,
        error: {
          code: err.message,
          message: TOKEN_ERROR_MESSAGES[err.message] || 'Link inválido.',
        },
      });
      return;
    }

    res.json({ success: true, data });
  });

  /**
   * POST /api/cotacao/:token
   * Recebe cotação preenchida no formulário (público)
   */
  static submitForm = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { token } = req.params;

    const parsed = submitSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Dados inválidos',
          details: parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        },
      });
      return;
    }

    let result;
    try {
      result = await QuoteFormService.submitForm(token, parsed.data);
    } catch (err: any) {
      // FF-BE-025 — categoria inválida vinda do payload tem que voltar como
      // 400 (input do usuário), não como 410 (token).
      if (err instanceof QuoteFormValidationError) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Dados inválidos',
            details: [{ field: err.field, message: err.message }],
          },
        });
        return;
      }

      res.status(410).json({
        success: false,
        error: {
          code: err.message,
          message: TOKEN_ERROR_MESSAGES[err.message] || 'Erro ao processar cotação.',
        },
      });
      return;
    }

    logger.info('Quote submitted via web form', result);

    res.status(201).json({ success: true, data: result });
  });

  /**
   * POST /api/cotacao/:token/suppliers
   * FF-BE-008 — Cadastra fornecedor a partir do formulário de cotação.
   * Autenticação via token. Retorna o fornecedor criado já com isOwn=true.
   */
  static createSupplier = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { token } = req.params;

      const parsed = createSupplierSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Dados inválidos',
            details: parsed.error.errors.map((e) => ({
              field: e.path.join('.'),
              message: e.message,
            })),
          },
        });
        return;
      }

      try {
        const supplier = await QuoteFormService.createSupplier(token, parsed.data);
        res.status(201).json({ success: true, data: supplier });
        return;
      } catch (err: any) {
        if (err instanceof QuoteFormSupplierConflictError) {
          res.status(409).json({
            success: false,
            error: {
              code: 'SUPPLIER_ALREADY_LINKED',
              message: `Este telefone já está vinculado a "${err.existingName}" na sua lista.`,
            },
          });
          return;
        }

        if (err instanceof QuoteFormValidationError) {
          res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Dados inválidos',
              details: [{ field: err.field, message: err.message }],
            },
          });
          return;
        }

        if (TOKEN_ERROR_MESSAGES[err.message]) {
          res.status(401).json({
            success: false,
            error: {
              code: err.message,
              message: TOKEN_ERROR_MESSAGES[err.message],
            },
          });
          return;
        }

        logger.error('Failed to create supplier from quote form', { error: err });
        res.status(500).json({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Erro ao cadastrar fornecedor.' },
        });
      }
    },
  );
}
