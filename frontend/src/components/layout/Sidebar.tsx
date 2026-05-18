import { Link, useLocation } from 'react-router-dom';
import { Home, FileText, HardHat, Package, Building2, CreditCard, Shield, MessageSquare, Settings2, BarChart2, Globe2, UserCog, ClipboardList } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';
import { LogoMark } from '../ui/logo';
import { useSidebarBadges } from '../../hooks/useSidebarBadges';

const menuItems = [
  { name: 'Dashboard', path: '/dashboard', icon: Home, resource: 'DASHBOARD' },
  { name: 'Cotações', path: '/quotes', icon: FileText, resource: 'QUOTES' },
  // CO-1-03/07: Obras + Materiais entregues na Sprint 1.
  { name: 'Obras', path: '/sites', icon: HardHat, resource: 'SITES' },
  { name: 'Materiais', path: '/materials', icon: Package, resource: 'MATERIALS' },
  { name: 'Fornecedores', path: '/suppliers', icon: Building2, resource: 'SUPPLIERS' },
  { name: 'Assinaturas', path: '/subscriptions', icon: CreditCard, resource: 'SUBSCRIPTIONS' },
  { name: 'WhatsApp', path: '/whatsapp', icon: MessageSquare, resource: 'WHATSAPP_CONFIG' },
  { name: 'Usuários', path: '/users', icon: Shield, resource: 'USERS' },
  { name: 'Relatórios', path: '/reports', icon: BarChart2, resource: 'REPORTS' },
  { name: 'Configurações', path: '/settings', icon: Settings2, resource: 'DASHBOARD' },
];

// FEAT-008 (FF-FE-001) — Seção exclusiva do SUPER_ADMIN.
// Aparece apenas para quem tem role=SUPER_ADMIN (cross-tenant).
const superAdminItems = [
  { name: 'Painel Admin', path: '/admin/dashboard', icon: Globe2 },
  { name: 'Tenants', path: '/admin/tenants', icon: Building2 },
  { name: 'Usuários (global)', path: '/admin/usuarios', icon: UserCog },
  { name: 'Audit Log', path: '/admin/audit-log', icon: ClipboardList },
];

export function Sidebar() {
  const location = useLocation();
  const { hasPermission, isSuperAdmin } = useAuth();
  const badges = useSidebarBadges();

  return (
    <aside className="w-56 bg-[hsl(var(--sidebar))] border-r border-border/50 flex flex-col">
      {/* Logo */}
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center gap-2.5">
          <LogoMark size={30} />
          <div>
            <div className="text-sm font-bold tracking-wide text-foreground">COTAOBRA</div>
            <div className="text-[10px] text-muted-foreground">Painel Admin</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto custom-scrollbar" aria-label="Menu principal">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;

          // Verificar permissão usando o recurso definido
          const canView = hasPermission(item.resource, 'view');

          if (!canView) {
            return null;
          }

          return (
            <Link
              key={item.path}
              to={item.path}
              aria-label={`Navegar para ${item.name}`}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm font-normal transition-colors',
                'hover:bg-secondary/80',
                isActive
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{item.name}</span>
              {/* Badge numérico para Cotações */}
              {item.path === '/quotes' && badges.quotes && (
                <span className="ml-auto bg-primary text-primary-foreground text-[10px] font-medium rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                  {badges.quotes}
                </span>
              )}
              {/* Dot de status para WhatsApp */}
              {item.path === '/whatsapp' && badges.whatsapp && (
                <span className={cn(
                  'ml-auto w-2 h-2 rounded-full',
                  badges.whatsapp === 'ok' ? 'bg-green-500' : 'bg-red-500'
                )} />
              )}
            </Link>
          );
        })}

        {/* FEAT-008 (FF-FE-001) — Seção SUPER_ADMIN */}
        {isSuperAdmin() && (
          <div className="pt-4 mt-4 border-t border-border/50">
            <p className="px-2.5 py-1 text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
              Plataforma
            </p>
            {superAdminItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname.startsWith(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm font-normal transition-colors',
                    'hover:bg-secondary/80',
                    isActive
                      ? 'bg-secondary text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1">{item.name}</span>
                </Link>
              );
            })}
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-border/50">
        <div className="px-2.5 py-2 text-xs text-muted-foreground">
          v1.0.0
        </div>
      </div>
    </aside>
  );
}
