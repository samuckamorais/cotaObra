import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Home,
  FileText,
  HardHat,
  Building2,
  MoreHorizontal,
  MessageSquare,
  Settings2,
  BarChart2,
  Shield,
  CreditCard,
  Gift,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

interface NavItem {
  name: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
}

const fixedItems: NavItem[] = [
  { name: 'Home', path: '/dashboard', icon: Home },
  { name: 'Cotações', path: '/quotes', icon: FileText },
  { name: 'Obras', path: '/sites', icon: HardHat },
  { name: 'Fornecedores', path: '/suppliers', icon: Building2 },
];

interface SheetItem {
  name: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  resource: string;
}

const sheetItems: SheetItem[] = [
  { name: 'WhatsApp', path: '/whatsapp', icon: MessageSquare, resource: 'DASHBOARD' },
  { name: 'Configurações', path: '/settings', icon: Settings2, resource: 'DASHBOARD' },
  { name: 'Relatórios', path: '/reports', icon: BarChart2, resource: 'DASHBOARD' },
  { name: 'Usuários', path: '/users', icon: Shield, resource: 'USERS' },
  { name: 'Assinaturas', path: '/subscriptions', icon: CreditCard, resource: 'DASHBOARD' },
  { name: 'Indicações', path: '/referral', icon: Gift, resource: 'DASHBOARD' },
];

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  // Close sheet on route change
  useEffect(() => {
    setIsSheetOpen(false);
  }, [location.pathname]);

  const visibleSheetItems = sheetItems.filter((item) =>
    hasPermission(item.resource, 'view')
  );

  const isActiveFixed = (path: string) =>
    location.pathname === path ||
    (path !== '/dashboard' && location.pathname.startsWith(path));

  const isActiveSheet = visibleSheetItems.some(
    (item) =>
      location.pathname === item.path || location.pathname.startsWith(item.path)
  );

  const handleSheetItemClick = (path: string) => {
    setIsSheetOpen(false);
    navigate(path);
  };

  return (
    <>
      {/* Overlay */}
      {isSheetOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/40"
          onClick={() => setIsSheetOpen(false)}
        />
      )}

      {/* Bottom Sheet */}
      <div
        className={cn(
          'md:hidden fixed bottom-16 left-0 right-0 z-50 bg-background rounded-t-2xl border-t border-border shadow-lg transition-transform duration-300',
          isSheetOpen ? 'translate-y-0' : 'translate-y-full'
        )}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <span className="text-sm font-medium text-foreground">Mais opções</span>
          <button
            onClick={() => setIsSheetOpen(false)}
            className="p-1 rounded-full hover:bg-muted"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1 px-3 pb-4">
          {visibleSheetItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              location.pathname === item.path ||
              location.pathname.startsWith(item.path);
            return (
              <button
                key={item.path}
                onClick={() => handleSheetItemClick(item.path)}
                className={cn(
                  'flex flex-col items-center justify-center gap-1.5 py-3 rounded-lg transition-colors',
                  'active:bg-secondary/50 touch-manipulation',
                  isActive ? 'text-primary bg-primary/5' : 'text-muted-foreground hover:bg-muted'
                )}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{item.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom Navigation Bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-around h-16">
          {fixedItems.map((item) => {
            const Icon = item.icon;
            const isActive = isActiveFixed(item.path);

            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors',
                  'active:bg-secondary/50 touch-manipulation',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <div
                  className={cn(
                    'relative',
                    isActive && 'animate-in zoom-in duration-200'
                  )}
                >
                  <Icon className="w-5 h-5" />
                  {isActive && (
                    <div className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" />
                  )}
                </div>
                <span
                  className={cn(
                    'text-[10px] font-medium',
                    isActive ? 'text-primary' : 'text-muted-foreground'
                  )}
                >
                  {item.name}
                </span>
              </Link>
            );
          })}

          {/* "Mais" button */}
          <button
            onClick={() => setIsSheetOpen((prev) => !prev)}
            className={cn(
              'flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors',
              'active:bg-secondary/50 touch-manipulation',
              isSheetOpen || isActiveSheet ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <div
              className={cn(
                'relative',
                (isSheetOpen || isActiveSheet) && 'animate-in zoom-in duration-200'
              )}
            >
              <MoreHorizontal className="w-5 h-5" />
              {isActiveSheet && !isSheetOpen && (
                <div className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" />
              )}
            </div>
            <span
              className={cn(
                'text-[10px] font-medium',
                isSheetOpen || isActiveSheet ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              Mais
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}
