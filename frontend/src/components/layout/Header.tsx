import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { LogOut, User as UserIcon, ShieldCheck, Sun, Moon, Monitor, Search } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { ConfirmModal } from '../ui/confirm-modal';

interface HeaderProps {
  onOpenCommandPalette?: () => void;
}

export function Header({ onOpenCommandPalette }: HeaderProps) {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [showThemeMenu, setShowThemeMenu] = useState(false);
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

  const currentThemeOption = themeOptions.find((opt) => opt.value === theme)!;
  const CurrentThemeIcon = currentThemeOption.icon;

  return (
    <header className="h-14 border-b border-border bg-background px-6 flex items-center justify-between">
      <div>
        <h2 className="text-sm font-medium text-foreground">
          Bem-vindo, {user?.name}
        </h2>
        <p className="text-xs text-muted-foreground">Gerencie suas cotações agrícolas</p>
      </div>

      <div className="flex items-center gap-2">
        {/* Search Bar — Desktop */}
        {onOpenCommandPalette && (
          <div
            onClick={onOpenCommandPalette}
            className="hidden md:flex items-center gap-2 bg-secondary/50 hover:bg-secondary rounded-lg px-3 py-1.5 cursor-pointer transition-colors max-w-md flex-1 border border-border/50"
            role="button"
            tabIndex={0}
            aria-label="Buscar cotações, produtores, fornecedores (Ctrl+K)"
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpenCommandPalette(); }}
          >
            <Search className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground flex-1">Buscar cotações, produtores, fornecedores...</span>
            <kbd className="hidden lg:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] bg-background rounded border border-border text-muted-foreground">
              Ctrl+K
            </kbd>
          </div>
        )}

        {/* User Info */}
        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-secondary/50 rounded-md border-0.5 border-border">
          <div className="flex items-center gap-1.5">
            <UserIcon className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-normal text-foreground">{user?.email}</span>
          </div>
          {user?.role === 'ADMIN' && (
            <Badge variant="default" className="text-xs">
              <ShieldCheck className="w-3 h-3 mr-0.5" />
              Admin
            </Badge>
          )}
        </div>

        {/* Theme Selector */}
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowThemeMenu(!showThemeMenu)}
            className="relative"
            aria-label={`Tema atual: ${currentThemeOption.label}. Clique para alterar.`}
            aria-expanded={showThemeMenu}
            aria-haspopup="true"
          >
            <CurrentThemeIcon className="w-4 h-4" />
          </Button>

          {showThemeMenu && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowThemeMenu(false)}
              />

              {/* Menu */}
              <div className="absolute right-0 top-full mt-1 w-32 bg-popover border-0.5 border-border rounded-md z-50 py-1">
                {themeOptions.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.value}
                      onClick={() => {
                        setTheme(option.value);
                        setShowThemeMenu(false);
                      }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-secondary transition-colors ${
                        theme === option.value
                          ? 'text-primary font-medium'
                          : 'text-foreground font-normal'
                      }`}
                      aria-label={`Tema ${option.label}`}
                      role="menuitem"
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Logout */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setConfirmLogout(true)}
          className="gap-2"
          aria-label="Sair do sistema"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="text-xs">Sair</span>
        </Button>
      </div>

      <ConfirmModal
        isOpen={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        onConfirm={handleLogout}
        title="Sair do sistema"
        description="Tem certeza que deseja encerrar a sessão?"
        confirmLabel="Sair"
        variant="warning"
      />
    </header>
  );
}
