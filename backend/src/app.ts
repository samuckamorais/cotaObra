import express, { Application, Router } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { errorMiddleware } from './middleware/error.middleware';
import { notFoundHandler } from './utils/error-handler';
import { globalRateLimit, rateLimitByPhone, loginRateLimit, loginRateLimitByEmail, forgotPasswordRateLimit, publicRateLimit, pdfResendRateLimit } from './middleware/rate-limit.middleware';
import { env } from './config/env';
import { authenticate } from './middleware/auth.middleware';
import { requireTenant, validateTenantOwnership } from './middleware/tenant.middleware';
import { requireWhatsAppConfigAccess } from './middleware/rbac.middleware';
import { WhatsAppController } from './modules/whatsapp/whatsapp.controller';
import { WhatsAppConfigController } from './modules/whatsapp-config/whatsapp-config.controller';
import { AuthController } from './modules/auth/auth.controller';
import { ProducerController } from './modules/producers/producer.controller';
import { SupplierController } from './modules/suppliers/supplier.controller';
import { SiteController } from './modules/sites/site.controller';
import { MaterialController, materialUpload } from './modules/materials/material.controller';
import { QuoteRequestController } from './modules/quote-requests/quote-request.controller';
import { PurchaseOrderController } from './modules/purchase-orders/purchase-order.controller';
import { QuoteController } from './modules/quotes/quote.controller';
import { QuotePdfController } from './modules/quotes/quote-pdf.controller';
import { DashboardController } from './modules/dashboard/dashboard.controller';
import { UserController } from './modules/users/user.controller';
import { ProposalController } from './modules/proposals/proposal.controller';
import { SettingsController } from './modules/settings/settings.controller';
import { ReportController } from './modules/reports/report.controller';
import { ProductCategoryController } from './modules/product-category/product-category.controller';
import { QuoteFormController } from './modules/quote-form/quote-form.controller';
import subscriptionsRouter from './modules/subscriptions/subscriptions.routes';
import { PrivacyController } from './modules/privacy/privacy.controller';
import { healthRouter } from './modules/health/health.controller';
import { SupplierDashboardController } from './modules/supplier-dashboard/supplier-dashboard.controller';
import { DocsController } from './modules/docs/docs.controller';
import { OnboardingController } from './modules/onboarding/onboarding.controller';
import { EventsController } from './modules/events/events.controller';
import { QuoteTemplateController } from './modules/quote-templates/quote-template.controller';
import { ReferralController } from './modules/referral/referral.controller';
import { BillingController } from './modules/billing/billing.controller';
import { LeadsController } from './modules/leads/leads.controller';
import { AdminController } from './modules/admin/admin.controller';
import { requireSuperAdmin } from './middleware/rbac.middleware';
import { withReason } from './middleware/with-reason.middleware';
import { require2FAEnrolledForSuperAdmin } from './middleware/require-2fa.middleware';

/**
 * Configuração do Express App
 */
export function createApp(): Application {
  const app = express();

  // Atrás do Traefik: confia em 1 proxy para que req.protocol respeite
  // X-Forwarded-Proto. Sem isso, a validação da assinatura Twilio falha
  // (Twilio assina https://... e o Express vê http://... → 403).
  app.set('trust proxy', 1);

  // ===================================
  // Middleware globais
  // ===================================
  app.use(helmet());
  // CORS: quando ALLOWED_ORIGINS='*', aceitar qualquer origin (reflect mode)
  // Necessário porque credentials:true não permite wildcard literal
  const corsOrigin = env.ALLOWED_ORIGINS === '*'
    ? ((_origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => { callback(null, true); })
    : env.ALLOWED_ORIGINS.split(',').map(s => s.trim());
  app.use(cors({ origin: corsOrigin, credentials: true }));
  app.use(compression());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(globalRateLimit);

  // ===================================
  // Health check
  // ===================================
  app.use('/health', healthRouter);

  // ===================================
  // API Routes
  // ===================================
  const apiRouter = Router();

  // Auth routes (public)
  apiRouter.post('/auth/login', loginRateLimit, loginRateLimitByEmail, AuthController.login);
  apiRouter.post('/auth/refresh', AuthController.refresh);
  apiRouter.post('/auth/logout', AuthController.logout);
  apiRouter.post('/auth/forgot-password', forgotPasswordRateLimit, AuthController.forgotPassword);
  apiRouter.post('/auth/reset-password', AuthController.resetPassword);
  apiRouter.post('/auth/verify-2fa', loginRateLimit, AuthController.verify2fa);
  // FEAT-008 (FF-BE-030): /auth/signup mantém handler que retorna 410 Gone.
  // Cadastro de novos usuários agora é exclusivamente via /api/admin/users.
  apiRouter.post('/auth/signup', loginRateLimit, AuthController.signup);

  // Auth routes (autenticadas) — passam pelo forcePasswordChange (whitelist).
  apiRouter.get('/auth/me', authenticate, AuthController.me);
  apiRouter.post('/auth/change-password', authenticate, AuthController.changePassword);
  // FEAT-008 (FF-BE-031): TOTP enrollment. Estão na whitelist do
  // forcePasswordChange (para SUPER_ADMIN sem senha trocada conseguir
  // ainda fazer o setup) — embora a ordem normal seja senha primeiro.
  apiRouter.post('/auth/2fa/setup-start', authenticate, AuthController.setupTotpStart);
  apiRouter.post('/auth/2fa/setup-confirm', authenticate, AuthController.setupTotpConfirm);
  apiRouter.post('/auth/2fa/disable', authenticate, AuthController.disableTotp);

  // Proposal form routes (public — token-based, sem autenticação)
  apiRouter.get('/proposta/:token', publicRateLimit, ProposalController.getForm);
  apiRouter.post('/proposta/:token', publicRateLimit, ProposalController.submitForm);
  apiRouter.get('/p/:token', publicRateLimit, ProposalController.getForm);
  apiRouter.post('/p/:token', publicRateLimit, ProposalController.submitForm);

  // Quote form routes (public — token-based, produtor preenche cotação via link)
  apiRouter.get('/cotacao/:token', publicRateLimit, QuoteFormController.getForm);
  apiRouter.post('/cotacao/:token', publicRateLimit, QuoteFormController.submitForm);
  apiRouter.post('/cotacao/:token/suppliers', publicRateLimit, QuoteFormController.createSupplier);

  // WhatsApp webhook routes (public)
  apiRouter.get('/whatsapp/webhook', WhatsAppController.verifyWebhook);
  apiRouter.post('/whatsapp/webhook', rateLimitByPhone, WhatsAppController.handleWebhook);
  // CO-3-07 — webhook de status (delivery/read receipts)
  apiRouter.post('/whatsapp/status-callback', WhatsAppController.statusCallback);

  // Dashboard routes (protected + tenant isolation)
  apiRouter.get('/dashboard', authenticate, requireTenant, DashboardController.getDashboard);
  apiRouter.get('/dashboard/stats', authenticate, requireTenant, DashboardController.getStats);
  apiRouter.get('/dashboard/kpis', authenticate, requireTenant, DashboardController.getKpis);
  apiRouter.get('/dashboard/quotes-by-day', authenticate, requireTenant, DashboardController.getQuotesByDay);
  apiRouter.get('/dashboard/top-products', authenticate, requireTenant, DashboardController.getTopProducts);

  // Producer routes (protected + tenant isolation)
  apiRouter.get('/producers', authenticate, requireTenant, ProducerController.list);
  apiRouter.get('/producers/:id', authenticate, requireTenant, ProducerController.getById);
  apiRouter.post('/producers', authenticate, requireTenant, ProducerController.create);
  apiRouter.put('/producers/:id', authenticate, requireTenant, ProducerController.update);
  apiRouter.delete('/producers/:id', authenticate, requireTenant, ProducerController.delete);
  apiRouter.get('/producers/:id/suppliers', authenticate, requireTenant, ProducerController.getSuppliers);
  apiRouter.post('/producers/:id/suppliers', authenticate, requireTenant, ProducerController.addSupplier);
  apiRouter.delete('/producers/:id/suppliers/:supplierId', authenticate, requireTenant, ProducerController.removeSupplier);

  // Supplier routes (protected + tenant isolation)
  apiRouter.get('/suppliers', authenticate, requireTenant, SupplierController.list);
  apiRouter.get('/suppliers/:id', authenticate, requireTenant, SupplierController.getById);
  apiRouter.post('/suppliers', authenticate, requireTenant, SupplierController.create);
  apiRouter.put('/suppliers/:id', authenticate, requireTenant, SupplierController.update);
  apiRouter.delete('/suppliers/:id', authenticate, requireTenant, SupplierController.delete);

  // CO-1-02 — Sites (Obras) routes
  apiRouter.get('/sites', authenticate, requireTenant, SiteController.list);
  apiRouter.get('/sites/:id', authenticate, requireTenant, SiteController.getById);
  apiRouter.post('/sites', authenticate, requireTenant, SiteController.create);
  apiRouter.patch('/sites/:id', authenticate, requireTenant, SiteController.update);
  apiRouter.delete('/sites/:id', authenticate, requireTenant, SiteController.delete);

  // CO-1-06 — Materials routes
  apiRouter.get('/materials', authenticate, requireTenant, MaterialController.list);
  apiRouter.get('/materials/:id', authenticate, requireTenant, MaterialController.getById);
  apiRouter.post('/materials', authenticate, requireTenant, MaterialController.create);
  apiRouter.patch('/materials/:id', authenticate, requireTenant, MaterialController.update);
  apiRouter.delete('/materials/:id', authenticate, requireTenant, MaterialController.delete);
  apiRouter.post(
    '/materials/import-csv',
    authenticate,
    requireTenant,
    materialUpload.single('file'),
    MaterialController.importCsv,
  );

  // CO-2-06 — Quote Requests (fila do comprador)
  apiRouter.get('/quote-requests/pending-count', authenticate, requireTenant, QuoteRequestController.pendingCount);
  apiRouter.get('/quote-requests', authenticate, requireTenant, QuoteRequestController.list);
  apiRouter.get('/quote-requests/:id', authenticate, requireTenant, QuoteRequestController.getById);
  apiRouter.post('/quote-requests/:id/promote', authenticate, requireTenant, QuoteRequestController.promote);
  apiRouter.post('/quote-requests/:id/reject', authenticate, requireTenant, QuoteRequestController.reject);

  // Quote routes (protected + tenant isolation)
  apiRouter.get('/quotes/stats', authenticate, requireTenant, QuoteController.getStats);
  apiRouter.get('/quotes/supplier-limit', authenticate, requireTenant, QuoteController.getSupplierLimit);
  apiRouter.get('/quotes', authenticate, requireTenant, QuoteController.list);
  apiRouter.get('/quotes/:id', authenticate, requireTenant, QuoteController.getById);
  apiRouter.get('/quotes/:id/results', authenticate, requireTenant, QuoteController.getResults);
  apiRouter.post('/quotes', authenticate, requireTenant, QuoteController.create);
  apiRouter.post('/quotes/:id/dispatch', authenticate, requireTenant, QuoteController.dispatch);
  // CO-3-01 — sugestão automática de fornecedores ranqueados
  apiRouter.get('/quotes/:id/suggested-suppliers', authenticate, requireTenant, QuoteController.suggestedSuppliers);
  // CO-3-09 — quadro de status dos fornecedores convidados
  apiRouter.get('/quotes/:id/supplier-status', authenticate, requireTenant, QuoteController.supplierStatus);
  // CO-4-03 — quadro comparativo (pricing engine + ranking corrigido)
  apiRouter.get('/quotes/:id/comparative', authenticate, requireTenant, QuoteController.comparative);
  // CO-4-07 — exportação XLSX do comparativo
  apiRouter.get('/quotes/:id/export', authenticate, requireTenant, QuoteController.exportComparative);

  // CO-5-03 — fechamento da cotação (cria PO)
  apiRouter.post('/quotes/:id/close-co5', authenticate, requireTenant, PurchaseOrderController.close);

  // CO-5-08 — listagem de POs
  apiRouter.get('/purchase-orders', authenticate, requireTenant, PurchaseOrderController.list);
  apiRouter.get('/purchase-orders/:id', authenticate, requireTenant, PurchaseOrderController.getById);
  apiRouter.put('/quotes/:id/close', authenticate, requireTenant, QuoteController.close);
  apiRouter.post('/quotes/:id/close-total', authenticate, requireTenant, QuoteController.closeWithTotalWinner);
  apiRouter.post('/quotes/:id/close-by-item', authenticate, requireTenant, QuoteController.closeWithItemWinners);
  apiRouter.post('/quotes/:id/notify-winner', authenticate, requireTenant, QuoteController.notifyWinner);

  // FEAT-PDF-001 — Endpoints do PDF de resultado.
  // validateTenantOwnership('quote', 'id') já garante que a cotação
  // existe no tenant do user. Permission gate granular (USER vê só
  // próprio Producer) está dentro do controller (§14.2).
  apiRouter.get(
    '/quotes/:id/pdf',
    authenticate,
    requireTenant,
    validateTenantOwnership('quote', 'id'),
    QuotePdfController.download,
  );
  apiRouter.post(
    '/quotes/:id/pdf/resend',
    authenticate,
    requireTenant,
    validateTenantOwnership('quote', 'id'),
    pdfResendRateLimit,
    QuotePdfController.resend,
  );

  // Subscription routes (protected)
  apiRouter.use('/subscriptions', subscriptionsRouter);

  // User routes (protected + tenant isolation)
  apiRouter.get('/users', authenticate, requireTenant, UserController.list);
  apiRouter.post('/users/invite', authenticate, requireTenant, UserController.invite);
  apiRouter.get('/users/:id', authenticate, requireTenant, UserController.getById);
  apiRouter.post('/users', authenticate, requireTenant, UserController.create);
  apiRouter.put('/users/:id', authenticate, requireTenant, UserController.update);
  apiRouter.delete('/users/:id', authenticate, requireTenant, UserController.delete);
  apiRouter.patch('/users/:id/status', authenticate, requireTenant, UserController.toggleStatus);

  // Reports routes (protected + tenant isolation)
  apiRouter.get('/reports/compare', authenticate, requireTenant, ReportController.compare);
  apiRouter.get('/reports/funnel', authenticate, requireTenant, ReportController.funnel);
  apiRouter.get(
    '/reports/conversational-funnel',
    authenticate,
    requireTenant,
    ReportController.conversationalFunnel,
  );

  // FF-BE-011 — Mapeamento Produto → Categoria (admin only, global)
  apiRouter.get(
    '/admin/product-categories',
    authenticate,
    requireTenant,
    ProductCategoryController.list,
  );
  apiRouter.post(
    '/admin/product-categories',
    authenticate,
    requireTenant,
    ProductCategoryController.create,
  );
  apiRouter.put(
    '/admin/product-categories/:id',
    authenticate,
    requireTenant,
    ProductCategoryController.update,
  );
  apiRouter.delete(
    '/admin/product-categories/:id',
    authenticate,
    requireTenant,
    ProductCategoryController.delete,
  );
  apiRouter.get('/reports/operational', authenticate, requireTenant, ReportController.operational);
  apiRouter.get('/reports/savings', authenticate, requireTenant, ReportController.savings);
  apiRouter.get('/reports/supplier-performance', authenticate, requireTenant, ReportController.supplierPerformance);
  apiRouter.get('/reports/category-region', authenticate, requireTenant, ReportController.categoryRegion);
  apiRouter.get('/reports/:type/export', authenticate, requireTenant, ReportController.exportReport);

  // Privacy/LGPD routes (protected + tenant isolation)
  apiRouter.get('/privacy/export/:id', authenticate, requireTenant, PrivacyController.exportData);
  apiRouter.delete('/privacy/forget/:id', authenticate, requireTenant, PrivacyController.forgetData);

  // Settings routes (protected — vinculado ao produtor do usuário logado)
  apiRouter.get('/settings', authenticate, SettingsController.get);
  apiRouter.put('/settings', authenticate, SettingsController.update);

  // WhatsApp Config routes (protected + tenant isolation - admin or WHATSAPP_CONFIG permission)
  const whatsappConfigController = new WhatsAppConfigController();
  apiRouter.get('/admin/whatsapp/config', authenticate, requireTenant, requireWhatsAppConfigAccess('canView'), whatsappConfigController.getConfig.bind(whatsappConfigController));
  apiRouter.put('/admin/whatsapp/config', authenticate, requireTenant, requireWhatsAppConfigAccess('canEdit'), whatsappConfigController.updateConfig.bind(whatsappConfigController));
  apiRouter.delete('/admin/whatsapp/config', authenticate, requireTenant, requireWhatsAppConfigAccess('canDelete'), whatsappConfigController.deleteConfig.bind(whatsappConfigController));
  apiRouter.post('/admin/whatsapp/test', authenticate, requireTenant, requireWhatsAppConfigAccess('canView'), whatsappConfigController.testConnection.bind(whatsappConfigController));
  apiRouter.get('/admin/whatsapp/qrcode', authenticate, requireTenant, requireWhatsAppConfigAccess('canView'), whatsappConfigController.getQRCode.bind(whatsappConfigController));
  apiRouter.post('/admin/whatsapp/reconnect', authenticate, requireTenant, requireWhatsAppConfigAccess('canEdit'), whatsappConfigController.reconnect.bind(whatsappConfigController));
  apiRouter.get('/admin/whatsapp/stats', authenticate, requireTenant, requireWhatsAppConfigAccess('canView'), whatsappConfigController.getStats.bind(whatsappConfigController));
  apiRouter.get('/admin/whatsapp/logs', authenticate, requireTenant, requireWhatsAppConfigAccess('canView'), whatsappConfigController.getLogs.bind(whatsappConfigController));
  apiRouter.post('/admin/whatsapp/webhook/register', authenticate, requireTenant, requireWhatsAppConfigAccess('canEdit'), whatsappConfigController.registerWebhook.bind(whatsappConfigController));

  // Billing routes (checkout = authenticated, webhook = public)
  apiRouter.post('/billing/checkout', authenticate, BillingController.checkout);
  apiRouter.get('/billing/subscription', authenticate, BillingController.getSubscription);
  apiRouter.post('/billing/cancel', authenticate, BillingController.cancel);
  apiRouter.post('/billing/webhook', BillingController.webhook);

  // Leads (captura de formulário da landing page — público)
  apiRouter.post('/leads', LeadsController.create);
  apiRouter.get('/leads', LeadsController.list); // protegido por senha no frontend

  // SSE Events stream (protected — real-time dashboard)
  apiRouter.get('/events', authenticate, EventsController.stream);

  // Onboarding progress (protected)
  apiRouter.get('/onboarding/progress', authenticate, OnboardingController.getProgress);

  // Quote Templates CRUD (protected + tenant isolation)
  apiRouter.get('/quote-templates', authenticate, requireTenant, QuoteTemplateController.list);
  apiRouter.get('/quote-templates/:id', authenticate, requireTenant, QuoteTemplateController.getById);
  apiRouter.post('/quote-templates', authenticate, requireTenant, QuoteTemplateController.create);
  apiRouter.put('/quote-templates/:id', authenticate, requireTenant, QuoteTemplateController.update);
  apiRouter.delete('/quote-templates/:id', authenticate, requireTenant, QuoteTemplateController.delete);

  // Referral routes (protected)
  apiRouter.get('/referral/stats', authenticate, ReferralController.getStats);
  apiRouter.post('/referral/create', authenticate, ReferralController.create);

  // Supplier Dashboard (public — token-based)
  apiRouter.get('/supplier-dashboard/:token', publicRateLimit, SupplierDashboardController.getMetrics);

  // ===================================
  // FEAT-008 — Super Admin (cross-tenant)
  // ===================================
  // Todas as rotas exigem:
  //   1) authenticate                         (JWT + forcePasswordChange embutido)
  //   2) requireSuperAdmin                    (role == SUPER_ADMIN)
  //   3) require2FAEnrolledForSuperAdmin      (FF-BE-031: 2FA TOTP ativo)
  //   4) withReason() (só em ações sensíveis)
  apiRouter.post('/admin/users', authenticate, requireSuperAdmin, require2FAEnrolledForSuperAdmin, AdminController.createUser);
  apiRouter.get('/admin/users', authenticate, requireSuperAdmin, require2FAEnrolledForSuperAdmin, AdminController.listUsers);
  apiRouter.post('/admin/users/:id/reset-password', authenticate, requireSuperAdmin, require2FAEnrolledForSuperAdmin, AdminController.resetPassword);
  apiRouter.post('/admin/users/:id/deactivate', authenticate, requireSuperAdmin, require2FAEnrolledForSuperAdmin, withReason(), AdminController.deactivateUser);
  apiRouter.post('/admin/users/:id/reactivate', authenticate, requireSuperAdmin, require2FAEnrolledForSuperAdmin, withReason(), AdminController.reactivateUser);

  apiRouter.get('/admin/tenants', authenticate, requireSuperAdmin, require2FAEnrolledForSuperAdmin, AdminController.listTenants);
  apiRouter.get('/admin/tenants/:id', authenticate, requireSuperAdmin, require2FAEnrolledForSuperAdmin, AdminController.getTenantDetail);
  apiRouter.post('/admin/tenants/:id/deactivate', authenticate, requireSuperAdmin, require2FAEnrolledForSuperAdmin, withReason(), AdminController.deactivateTenant);
  apiRouter.post('/admin/tenants/:id/reactivate', authenticate, requireSuperAdmin, require2FAEnrolledForSuperAdmin, withReason(), AdminController.reactivateTenant);

  apiRouter.get('/admin/audit-log', authenticate, requireSuperAdmin, require2FAEnrolledForSuperAdmin, AdminController.listAuditLog);

  // API Documentation (public)
  apiRouter.get('/docs', DocsController.getApiDocs);

  app.use('/api', apiRouter);

  // ===================================
  // Error handling
  // ===================================
  app.use(notFoundHandler);
  app.use(errorMiddleware);

  return app;
}
