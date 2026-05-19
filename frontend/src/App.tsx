import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './hooks/use-toast';
import { ProposalForm } from './pages/ProposalForm';
import { QuoteForm } from './pages/QuoteForm';
import { useAnalytics } from './hooks/useAnalytics';
import { usePerformance } from './hooks/usePerformance';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CommandPalette, useCommandPalette } from './components/command/CommandPalette';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { MobileHeader } from './components/layout/MobileHeader';
import { BottomNav } from './components/layout/BottomNav';
import { PageLoadingSkeleton } from './components/ui/page-loading';
import { Login } from './pages/Login'; // Keep Login eager for better UX
import { Signup } from './pages/Signup';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { Verify2FA } from './pages/Verify2FA';
import { LeadsAdmin } from './pages/LeadsAdmin';
import { ForcedChangePassword } from './pages/ForcedChangePassword';
import { ForcedFlowGuard, RequireSuperAdmin } from './components/guards/AdminGuards';

// CO-0-08: páginas Landing/PreLaunch/ComingSoon/Producers removidas no Sprint 0.
// CO-1-03: SitesPlaceholder substituído pela tela Sites.tsx real (CRUD).
// CO-1-07: Materials.tsx (catálogo) com import CSV.
const Sites = lazy(() => import('./pages/Sites'));
const Materials = lazy(() => import('./pages/Materials'));
const QuoteRequests = lazy(() => import('./pages/QuoteRequests'));

// Lazy load route components for code splitting
const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));

// FEAT-008 (FF-FE-001) — telas admin (super admin cross-tenant)
const TwoFactorSetup = lazy(() => import('./pages/admin/TwoFactorSetup').then((m) => ({ default: m.TwoFactorSetup })));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard').then((m) => ({ default: m.AdminDashboard })));
const AdminTenants = lazy(() => import('./pages/admin/AdminTenants').then((m) => ({ default: m.AdminTenants })));
const AdminTenantDetail = lazy(() => import('./pages/admin/AdminTenantDetail').then((m) => ({ default: m.AdminTenantDetail })));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers').then((m) => ({ default: m.AdminUsers })));
const AdminNewUser = lazy(() => import('./pages/admin/AdminNewUser').then((m) => ({ default: m.AdminNewUser })));
const AdminUserDetail = lazy(() => import('./pages/admin/AdminUserDetail').then((m) => ({ default: m.AdminUserDetail })));
const AdminAuditLog = lazy(() => import('./pages/admin/AdminAuditLog').then((m) => ({ default: m.AdminAuditLog })));
const Quotes = lazy(() => import('./pages/Quotes').then((m) => ({ default: m.Quotes })));
const QuoteDetail = lazy(() => import('./pages/QuoteDetail').then((m) => ({ default: m.QuoteDetail })));
const Suppliers = lazy(() => import('./pages/Suppliers').then((m) => ({ default: m.Suppliers })));
const Users = lazy(() => import('./pages/Users').then((m) => ({ default: m.Users })));
const Subscriptions = lazy(() => import('./pages/Subscriptions').then((m) => ({ default: m.Subscriptions })));
const WhatsAppConfig = lazy(() => import('./pages/WhatsAppConfig').then((m) => ({ default: m.default })));
const QuoteResults = lazy(() => import('./pages/QuoteResults').then((m) => ({ default: m.QuoteResults })));
const SettingsPage = lazy(() => import('./pages/Settings').then((m) => ({ default: m.SettingsPage })));
const Reports = lazy(() => import('./pages/Reports').then((m) => ({ default: m.Reports })));
const ReferralPage = lazy(() => import('./pages/Referral').then((m) => ({ default: m.Referral })));

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <BrowserRouter>
              <Routes>
                {/* CO-0-08: raiz redireciona pra /login até a landing CotaObra entrar (Sprint 1+) */}
                <Route path="/" element={<Navigate to="/login" replace />} />
                <Route path="/admin/leads" element={<LeadsAdmin />} />
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/verify-2fa" element={<Verify2FA />} />
                {/* FEAT-008 (FF-FE-001): rota bloqueante de troca de senha + setup 2FA */}
                <Route
                  path="/forced-change-password"
                  element={<ForcedChangePassword />}
                />
                <Route
                  path="/admin/2fa-setup"
                  element={
                    <Suspense fallback={<PageLoadingSkeleton />}>
                      <TwoFactorSetup />
                    </Suspense>
                  }
                />
                {/* Rota pública para formulário de proposta do fornecedor */}
                <Route path="/proposta/:token" element={<ProposalForm />} />
                <Route path="/p/:token" element={<ProposalForm />} />
                {/* Rota pública para formulário de cotação do solicitante */}
                <Route path="/cotacao/:token" element={<QuoteForm />} />
                <Route path="/*" element={<ProtectedLayout />} />
              </Routes>
            </BrowserRouter>
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

function ProtectedLayout() {
  const { user, loading } = useAuth();
  const commandPalette = useCommandPalette();

  // Track analytics and performance
  useAnalytics();
  usePerformance();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-600">Carregando...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // FEAT-008 (FF-FE-001): redireciona pra /forced-change-password ou
  // /admin/2fa-setup ANTES de renderizar o layout completo.
  return (
    <ForcedFlowGuard>
      <ErrorBoundary>
      {/* Desktop Layout */}
      <div className="hidden md:flex h-screen bg-background">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header onOpenCommandPalette={commandPalette.open} />
          <main className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
            <Suspense fallback={<PageLoadingSkeleton />}>
              <Routes>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/quotes" element={<Quotes />} />
                <Route path="/quotes/:id" element={<QuoteDetail />} />
                <Route path="/quotes/:id/resultados" element={<QuoteResults />} />
                {/* CO-1-03/07 Sprint 1, CO-2-07 Sprint 2 */}
                <Route path="/sites" element={<Sites />} />
                <Route path="/materials" element={<Materials />} />
                <Route path="/quote-requests" element={<QuoteRequests />} />
                <Route path="/suppliers" element={<Suppliers />} />
                <Route path="/users" element={<Users />} />
                <Route path="/subscriptions" element={<Subscriptions />} />
                <Route path="/whatsapp" element={<WhatsAppConfig />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/referral" element={<ReferralPage />} />

                {/* FEAT-008 (FF-FE-001) — rotas /admin/* (super admin) */}
                <Route path="/admin/dashboard" element={<RequireSuperAdmin><AdminDashboard /></RequireSuperAdmin>} />
                <Route path="/admin/tenants" element={<RequireSuperAdmin><AdminTenants /></RequireSuperAdmin>} />
                <Route path="/admin/tenants/:id" element={<RequireSuperAdmin><AdminTenantDetail /></RequireSuperAdmin>} />
                <Route path="/admin/usuarios" element={<RequireSuperAdmin><AdminUsers /></RequireSuperAdmin>} />
                <Route path="/admin/usuarios/novo" element={<RequireSuperAdmin><AdminNewUser /></RequireSuperAdmin>} />
                <Route path="/admin/usuarios/:id" element={<RequireSuperAdmin><AdminUserDetail /></RequireSuperAdmin>} />
                <Route path="/admin/audit-log" element={<RequireSuperAdmin><AdminAuditLog /></RequireSuperAdmin>} />
              </Routes>
            </Suspense>
          </main>
        </div>
      </div>

      {/* Mobile Layout */}
      <div className="md:hidden flex flex-col h-screen bg-background">
        <MobileHeader onOpenCommandPalette={commandPalette.open} />
        <main className="flex-1 overflow-y-auto overflow-x-hidden pb-20 custom-scrollbar">
          <Suspense fallback={<PageLoadingSkeleton />}>
            <Routes>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/quotes" element={<Quotes />} />
              <Route path="/quotes/:id" element={<QuoteDetail />} />
              <Route path="/sites" element={<Sites />} />
              <Route path="/materials" element={<Materials />} />
              <Route path="/quote-requests" element={<QuoteRequests />} />
              <Route path="/suppliers" element={<Suppliers />} />
              <Route path="/users" element={<Users />} />
              <Route path="/subscriptions" element={<Subscriptions />} />
              <Route path="/whatsapp" element={<WhatsAppConfig />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/settings" element={<SettingsPage />} />

              {/* FEAT-008 — mobile também navega para admin */}
              <Route path="/admin/dashboard" element={<RequireSuperAdmin><AdminDashboard /></RequireSuperAdmin>} />
              <Route path="/admin/tenants" element={<RequireSuperAdmin><AdminTenants /></RequireSuperAdmin>} />
              <Route path="/admin/tenants/:id" element={<RequireSuperAdmin><AdminTenantDetail /></RequireSuperAdmin>} />
              <Route path="/admin/usuarios" element={<RequireSuperAdmin><AdminUsers /></RequireSuperAdmin>} />
              <Route path="/admin/usuarios/novo" element={<RequireSuperAdmin><AdminNewUser /></RequireSuperAdmin>} />
              <Route path="/admin/usuarios/:id" element={<RequireSuperAdmin><AdminUserDetail /></RequireSuperAdmin>} />
              <Route path="/admin/audit-log" element={<RequireSuperAdmin><AdminAuditLog /></RequireSuperAdmin>} />
            </Routes>
          </Suspense>
        </main>
        <BottomNav />
      </div>

      {/* Command Palette (Cmd+K) - Works on both */}
      <CommandPalette isOpen={commandPalette.isOpen} onClose={commandPalette.close} />
    </ErrorBoundary>
    </ForcedFlowGuard>
  );
}

export default App;
