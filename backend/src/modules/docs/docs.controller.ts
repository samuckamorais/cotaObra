import { Request, Response } from 'express';

/**
 * Controlador de documentação da API
 * Retorna uma página HTML simples listando todos os endpoints agrupados por módulo
 */
export class DocsController {
  static getApiDocs = (_req: Request, res: Response): void => {
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CotaObra API - Documentação</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f9fafb; color: #1f2937; padding: 2rem; }
    h1 { font-size: 1.8rem; margin-bottom: 0.5rem; }
    .subtitle { color: #6b7280; margin-bottom: 2rem; }
    .section { background: white; border-radius: 8px; padding: 1.5rem; margin-bottom: 1.5rem; border: 1px solid #e5e7eb; }
    .section h2 { font-size: 1.1rem; color: #059669; margin-bottom: 1rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.5rem; }
    .endpoint { display: flex; align-items: center; gap: 0.75rem; padding: 0.4rem 0; font-size: 0.9rem; }
    .method { display: inline-block; width: 60px; text-align: center; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; color: white; }
    .GET { background: #3b82f6; }
    .POST { background: #10b981; }
    .PUT { background: #f59e0b; }
    .PATCH { background: #8b5cf6; }
    .DELETE { background: #ef4444; }
    .path { font-family: 'SF Mono', Monaco, monospace; font-size: 0.85rem; }
    .auth { font-size: 0.7rem; padding: 2px 6px; border-radius: 3px; background: #fef3c7; color: #92400e; }
    .public { background: #d1fae5; color: #065f46; }
    footer { text-align: center; color: #9ca3af; font-size: 0.8rem; margin-top: 2rem; }
  </style>
</head>
<body>
  <h1>CotaObra API</h1>
  <p class="subtitle">Documentação de endpoints - v1.0.0</p>

  <div class="section">
    <h2>Auth (Autenticação)</h2>
    <div class="endpoint"><span class="method POST">POST</span> <span class="path">/api/auth/login</span> <span class="auth public">público</span></div>
    <div class="endpoint"><span class="method POST">POST</span> <span class="path">/api/auth/refresh</span> <span class="auth public">público</span></div>
    <div class="endpoint"><span class="method POST">POST</span> <span class="path">/api/auth/logout</span> <span class="auth public">público</span></div>
    <div class="endpoint"><span class="method POST">POST</span> <span class="path">/api/auth/forgot-password</span> <span class="auth public">público</span></div>
    <div class="endpoint"><span class="method POST">POST</span> <span class="path">/api/auth/reset-password</span> <span class="auth public">público</span></div>
    <div class="endpoint"><span class="method POST">POST</span> <span class="path">/api/auth/verify-2fa</span> <span class="auth public">público</span></div>
  </div>

  <div class="section">
    <h2>Dashboard</h2>
    <div class="endpoint"><span class="method GET">GET</span> <span class="path">/api/dashboard</span> <span class="auth">autenticado</span></div>
    <div class="endpoint"><span class="method GET">GET</span> <span class="path">/api/dashboard/stats</span> <span class="auth">autenticado</span></div>
    <div class="endpoint"><span class="method GET">GET</span> <span class="path">/api/dashboard/quotes-by-day</span> <span class="auth">autenticado</span></div>
    <div class="endpoint"><span class="method GET">GET</span> <span class="path">/api/dashboard/top-products</span> <span class="auth">autenticado</span></div>
  </div>

  <div class="section">
    <h2>Produtores</h2>
    <div class="endpoint"><span class="method GET">GET</span> <span class="path">/api/producers</span> <span class="auth">autenticado</span></div>
    <div class="endpoint"><span class="method GET">GET</span> <span class="path">/api/producers/:id</span> <span class="auth">autenticado</span></div>
    <div class="endpoint"><span class="method POST">POST</span> <span class="path">/api/producers</span> <span class="auth">autenticado</span></div>
    <div class="endpoint"><span class="method PUT">PUT</span> <span class="path">/api/producers/:id</span> <span class="auth">autenticado</span></div>
    <div class="endpoint"><span class="method DELETE">DELETE</span> <span class="path">/api/producers/:id</span> <span class="auth">autenticado</span></div>
    <div class="endpoint"><span class="method GET">GET</span> <span class="path">/api/producers/:id/suppliers</span> <span class="auth">autenticado</span></div>
    <div class="endpoint"><span class="method POST">POST</span> <span class="path">/api/producers/:id/suppliers</span> <span class="auth">autenticado</span></div>
    <div class="endpoint"><span class="method DELETE">DELETE</span> <span class="path">/api/producers/:id/suppliers/:supplierId</span> <span class="auth">autenticado</span></div>
  </div>

  <div class="section">
    <h2>Fornecedores</h2>
    <div class="endpoint"><span class="method GET">GET</span> <span class="path">/api/suppliers</span> <span class="auth">autenticado</span></div>
    <div class="endpoint"><span class="method GET">GET</span> <span class="path">/api/suppliers/:id</span> <span class="auth">autenticado</span></div>
    <div class="endpoint"><span class="method POST">POST</span> <span class="path">/api/suppliers</span> <span class="auth">autenticado</span></div>
    <div class="endpoint"><span class="method PUT">PUT</span> <span class="path">/api/suppliers/:id</span> <span class="auth">autenticado</span></div>
    <div class="endpoint"><span class="method DELETE">DELETE</span> <span class="path">/api/suppliers/:id</span> <span class="auth">autenticado</span></div>
  </div>

  <div class="section">
    <h2>Cotações</h2>
    <div class="endpoint"><span class="method GET">GET</span> <span class="path">/api/quotes</span> <span class="auth">autenticado</span></div>
    <div class="endpoint"><span class="method GET">GET</span> <span class="path">/api/quotes/stats</span> <span class="auth">autenticado</span></div>
    <div class="endpoint"><span class="method GET">GET</span> <span class="path">/api/quotes/:id</span> <span class="auth">autenticado</span></div>
    <div class="endpoint"><span class="method GET">GET</span> <span class="path">/api/quotes/:id/results</span> <span class="auth">autenticado</span></div>
    <div class="endpoint"><span class="method POST">POST</span> <span class="path">/api/quotes</span> <span class="auth">autenticado</span></div>
    <div class="endpoint"><span class="method POST">POST</span> <span class="path">/api/quotes/:id/dispatch</span> <span class="auth">autenticado</span></div>
    <div class="endpoint"><span class="method PUT">PUT</span> <span class="path">/api/quotes/:id/close</span> <span class="auth">autenticado</span></div>
    <div class="endpoint"><span class="method POST">POST</span> <span class="path">/api/quotes/:id/close-total</span> <span class="auth">autenticado</span></div>
    <div class="endpoint"><span class="method POST">POST</span> <span class="path">/api/quotes/:id/close-by-item</span> <span class="auth">autenticado</span></div>
    <div class="endpoint"><span class="method POST">POST</span> <span class="path">/api/quotes/:id/notify-winner</span> <span class="auth">autenticado</span></div>
  </div>

  <div class="section">
    <h2>Propostas (Formulários Públicos)</h2>
    <div class="endpoint"><span class="method GET">GET</span> <span class="path">/api/proposta/:token</span> <span class="auth public">público (token)</span></div>
    <div class="endpoint"><span class="method POST">POST</span> <span class="path">/api/proposta/:token</span> <span class="auth public">público (token)</span></div>
    <div class="endpoint"><span class="method GET">GET</span> <span class="path">/api/p/:token</span> <span class="auth public">público (token)</span></div>
    <div class="endpoint"><span class="method POST">POST</span> <span class="path">/api/p/:token</span> <span class="auth public">público (token)</span></div>
  </div>

  <div class="section">
    <h2>Formulário de Cotação (Público)</h2>
    <div class="endpoint"><span class="method GET">GET</span> <span class="path">/api/cotacao/:token</span> <span class="auth public">público (token)</span></div>
    <div class="endpoint"><span class="method POST">POST</span> <span class="path">/api/cotacao/:token</span> <span class="auth public">público (token)</span></div>
  </div>

  <div class="section">
    <h2>Dashboard do Fornecedor (Público)</h2>
    <div class="endpoint"><span class="method GET">GET</span> <span class="path">/api/supplier-dashboard/:token</span> <span class="auth public">público (token)</span></div>
  </div>

  <div class="section">
    <h2>Relatórios</h2>
    <div class="endpoint"><span class="method GET">GET</span> <span class="path">/api/reports/funnel</span> <span class="auth">autenticado</span></div>
    <div class="endpoint"><span class="method GET">GET</span> <span class="path">/api/reports/operational</span> <span class="auth">autenticado</span></div>
    <div class="endpoint"><span class="method GET">GET</span> <span class="path">/api/reports/savings</span> <span class="auth">autenticado</span></div>
    <div class="endpoint"><span class="method GET">GET</span> <span class="path">/api/reports/supplier-performance</span> <span class="auth">autenticado</span></div>
    <div class="endpoint"><span class="method GET">GET</span> <span class="path">/api/reports/category-region</span> <span class="auth">autenticado</span></div>
    <div class="endpoint"><span class="method GET">GET</span> <span class="path">/api/reports/:type/export?format=pdf|xlsx</span> <span class="auth">autenticado</span></div>
  </div>

  <div class="section">
    <h2>Assinaturas</h2>
    <div class="endpoint"><span class="method GET">GET</span> <span class="path">/api/subscriptions</span> <span class="auth">autenticado</span></div>
  </div>

  <div class="section">
    <h2>Usuários</h2>
    <div class="endpoint"><span class="method GET">GET</span> <span class="path">/api/users</span> <span class="auth">autenticado</span></div>
    <div class="endpoint"><span class="method POST">POST</span> <span class="path">/api/users/invite</span> <span class="auth">autenticado</span></div>
    <div class="endpoint"><span class="method GET">GET</span> <span class="path">/api/users/:id</span> <span class="auth">autenticado</span></div>
    <div class="endpoint"><span class="method POST">POST</span> <span class="path">/api/users</span> <span class="auth">autenticado</span></div>
    <div class="endpoint"><span class="method PUT">PUT</span> <span class="path">/api/users/:id</span> <span class="auth">autenticado</span></div>
    <div class="endpoint"><span class="method DELETE">DELETE</span> <span class="path">/api/users/:id</span> <span class="auth">autenticado</span></div>
    <div class="endpoint"><span class="method PATCH">PATCH</span> <span class="path">/api/users/:id/status</span> <span class="auth">autenticado</span></div>
  </div>

  <div class="section">
    <h2>Configurações</h2>
    <div class="endpoint"><span class="method GET">GET</span> <span class="path">/api/settings</span> <span class="auth">autenticado</span></div>
    <div class="endpoint"><span class="method PUT">PUT</span> <span class="path">/api/settings</span> <span class="auth">autenticado</span></div>
  </div>

  <div class="section">
    <h2>Privacidade / LGPD</h2>
    <div class="endpoint"><span class="method GET">GET</span> <span class="path">/api/privacy/export/:id</span> <span class="auth">autenticado</span></div>
    <div class="endpoint"><span class="method DELETE">DELETE</span> <span class="path">/api/privacy/forget/:id</span> <span class="auth">autenticado</span></div>
  </div>

  <div class="section">
    <h2>WhatsApp</h2>
    <div class="endpoint"><span class="method GET">GET</span> <span class="path">/api/whatsapp/webhook</span> <span class="auth public">público</span></div>
    <div class="endpoint"><span class="method POST">POST</span> <span class="path">/api/whatsapp/webhook</span> <span class="auth public">público</span></div>
    <div class="endpoint"><span class="method GET">GET</span> <span class="path">/api/admin/whatsapp/config</span> <span class="auth">autenticado + permissão</span></div>
    <div class="endpoint"><span class="method PUT">PUT</span> <span class="path">/api/admin/whatsapp/config</span> <span class="auth">autenticado + permissão</span></div>
    <div class="endpoint"><span class="method DELETE">DELETE</span> <span class="path">/api/admin/whatsapp/config</span> <span class="auth">autenticado + permissão</span></div>
    <div class="endpoint"><span class="method POST">POST</span> <span class="path">/api/admin/whatsapp/test</span> <span class="auth">autenticado + permissão</span></div>
    <div class="endpoint"><span class="method GET">GET</span> <span class="path">/api/admin/whatsapp/qrcode</span> <span class="auth">autenticado + permissão</span></div>
    <div class="endpoint"><span class="method POST">POST</span> <span class="path">/api/admin/whatsapp/reconnect</span> <span class="auth">autenticado + permissão</span></div>
    <div class="endpoint"><span class="method GET">GET</span> <span class="path">/api/admin/whatsapp/stats</span> <span class="auth">autenticado + permissão</span></div>
    <div class="endpoint"><span class="method GET">GET</span> <span class="path">/api/admin/whatsapp/logs</span> <span class="auth">autenticado + permissão</span></div>
    <div class="endpoint"><span class="method POST">POST</span> <span class="path">/api/admin/whatsapp/webhook/register</span> <span class="auth">autenticado + permissão</span></div>
  </div>

  <div class="section">
    <h2>Documentação</h2>
    <div class="endpoint"><span class="method GET">GET</span> <span class="path">/api/docs</span> <span class="auth public">público</span></div>
  </div>

  <footer>
    <p>CotaObra API &mdash; Gerado automaticamente</p>
  </footer>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  };
}
