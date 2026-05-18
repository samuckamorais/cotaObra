import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, X, Search, Sun, Moon, Monitor, LogOut, User as UserIcon, FileText, MessageSquare } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { LogoMark } from '../ui/logo';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { cn } from '@/lib/utils';
import { ConfirmModal } from '../ui/confirm-modal';

interface MobileHeaderProps {
  onOpenCommandPalette?: () => void;
  title?: string;
}

export function MobileHeader({ onOpenCommandPalette, title }: MobileHeaderProps) {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [showMenu, setShowMenu] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const themeOptions = [
    { value: 'light' as const, label: 'Claro', icon: Sun },
    { value: 'dark' as const, label: 'Escuro', icon: Moon },
    { value: 'system' as const, label: 'Sistema', icon: Monitor },
  ];


  return (
    <>
      {/* Mobile Header */}
      <header className="md:hidden sticky top-0 z-30 bg-background border-b border-border safe-area-inset-top">
        <div className="flex items-center justify-between h-14 px-4">
          {/* Menu Button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowMenu(true)}
            className="touch-manipulation"
          >
            <Menu className="w-5 h-5" />
          </Button>

          {/* Title or Logo */}
          <div className="flex-1 text-center">
            {title ? (
              <h1 className="text-sm font-medium text-foreground truncate">{title}</h1>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <LogoMark size={24} />
                <span className="text-sm font-bold tracking-wide text-foreground">COTAOBRA</span>
              </div>
            )}
          </div>

          {/* Search Button */}
          {onOpenCommandPalette && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onOpenCommandPalette}
              className="touch-manipulation"
            >
              <Search className="w-5 h-5" />
            </Button>
          )}
        </div>
      </header>

      {/* Slide-out Menu */}
      {showMenu && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-50 md:hidden animate-in fade-in duration-200"
            onClick={() => setShowMenu(false)}
          />

          {/* Menu Panel */}
          <div className="fixed top-0 left-0 bottom-0 w-80 max-w-[85vw] bg-background z-50 md:hidden animate-in slide-in-from-left duration-300 shadow-2xl">
            <div className="flex flex-col h-full">
              {/* Menu Header */}
              <div className="flex items-center justify-between p-4 border-b border-border">
                <div>
                  <h2 className="text-base font-medium text-foreground">Menu</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {user?.name}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowMenu(false)}
                  className="touch-manipulation"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>

              {/* User Info */}
              <div className="p-4 bg-secondary/30 border-b border-border">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground">
                    <UserIcon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {user?.email}
                    </p>
                    {user?.role === 'ADMIN' && (
                      <Badge variant="default" className="text-xs mt-1">
                        Admin
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Menu Content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {/* Theme Selector */}
                <div className="mb-4">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Tema</p>
                  <div className="flex gap-2">
                    {themeOptions.map((option) => {
                      const Icon = option.icon;
                      return (
                        <button
                          key={option.value}
                          onClick={() => {
                            setTheme(option.value);
                          }}
                          className={cn(
                            'flex-1 flex flex-col items-center gap-1.5 p-3 rounded-md border transition-colors touch-manipulation',
                            theme === option.value
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border bg-background text-muted-foreground'
                          )}
                        >
                          <Icon className="w-5 h-5" />
                          <span className="text-xs">{option.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Quick Actions */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Ações Rápidas</p>
                  <div className="space-y-1">
                    <Button
                      variant="ghost"
                      className="w-full justify-start touch-manipulation"
                      onClick={() => {
                        navigate('/quotes');
                        setShowMenu(false);
                      }}
                    >
                      <FileText className="w-4 h-4 mr-3" />
                      Ver Cotações
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full justify-start touch-manipulation"
                      onClick={() => {
                        navigate('/whatsapp');
                        setShowMenu(false);
                      }}
                    >
                      <MessageSquare className="w-4 h-4 mr-3" />
                      Config WhatsApp
                    </Button>
                  </div>
                </div>
              </div>

              {/* Menu Footer */}
              <div className="p-4 border-t border-border">
                <Button
                  variant="outline"
                  className="w-full justify-start text-destructive border-destructive/30 hover:bg-destructive/10 touch-manipulation"
                  onClick={() => setConfirmLogout(true)}
                >
                  <LogOut className="w-4 h-4 mr-3" />
                  Sair
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      <ConfirmModal
        isOpen={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        onConfirm={handleLogout}
        title="Sair do sistema"
        description="Tem certeza que deseja encerrar a sessão?"
        confirmLabel="Sair"
        variant="warning"
      />
    </>
  );
}
