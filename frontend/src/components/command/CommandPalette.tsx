import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Home,
  FileText,
  Users,
  Building2,
  MessageSquare,
  CreditCard,
  Shield,
  Search,
  Plus,
  BarChart2,
  Settings2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

interface Command {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  action: () => void;
  keywords: string[];
  category: 'navigation' | 'actions' | 'settings';
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const commands: Command[] = [
    // Navigation
    {
      id: 'nav-dashboard',
      label: 'Dashboard',
      description: 'Visão geral do sistema',
      icon: <Home className="w-4 h-4" />,
      action: () => navigate('/dashboard'),
      keywords: ['home', 'inicio', 'início', 'dashboard', 'visão geral', 'painel', 'resumo'],
      category: 'navigation',
    },
    {
      id: 'nav-quotes',
      label: 'Cotações',
      description: 'Gerenciar cotações',
      icon: <FileText className="w-4 h-4" />,
      action: () => navigate('/quotes'),
      keywords: ['cotações', 'cotacoes', 'quotes', 'pedidos', 'orçamentos', 'orcamentos'],
      category: 'navigation',
    },
    {
      id: 'nav-sites',
      label: 'Obras',
      description: 'Lista de obras (em construção — Sprint 1)',
      icon: <Users className="w-4 h-4" />,
      action: () => navigate('/sites'),
      keywords: ['obras', 'sites', 'canteiros', 'projetos'],
      category: 'navigation',
    },
    {
      id: 'nav-suppliers',
      label: 'Fornecedores',
      description: 'Lista de fornecedores',
      icon: <Building2 className="w-4 h-4" />,
      action: () => navigate('/suppliers'),
      keywords: ['fornecedores', 'suppliers', 'vendedores', 'parceiros'],
      category: 'navigation',
    },
    {
      id: 'nav-whatsapp',
      label: 'WhatsApp',
      description: 'Configurar WhatsApp',
      icon: <MessageSquare className="w-4 h-4" />,
      action: () => navigate('/whatsapp'),
      keywords: ['whatsapp', 'mensagens', 'configuração'],
      category: 'navigation',
    },
    {
      id: 'nav-subscriptions',
      label: 'Assinaturas',
      description: 'Gerenciar planos',
      icon: <CreditCard className="w-4 h-4" />,
      action: () => navigate('/subscriptions'),
      keywords: ['assinaturas', 'subscriptions', 'planos', 'pagamento'],
      category: 'navigation',
    },
    {
      id: 'nav-users',
      label: 'Usuários',
      description: 'Gerenciar usuários',
      icon: <Shield className="w-4 h-4" />,
      action: () => navigate('/users'),
      keywords: ['usuários', 'users', 'permissões', 'acesso', 'equipe', 'membros'],
      category: 'navigation',
    },
    {
      id: 'nav-reports',
      label: 'Relatórios',
      description: 'Análises e métricas',
      icon: <BarChart2 className="w-4 h-4" />,
      action: () => navigate('/reports'),
      keywords: ['relatórios', 'relatorios', 'reports', 'análises', 'analises', 'métricas', 'metricas', 'gráficos'],
      category: 'navigation',
    },
    {
      id: 'nav-settings',
      label: 'Configurações',
      description: 'Preferências do sistema',
      icon: <Settings2 className="w-4 h-4" />,
      action: () => navigate('/settings'),
      keywords: ['configurações', 'configuracoes', 'settings', 'preferências', 'preferencias', 'ajustes', 'opções'],
      category: 'settings',
    },

    // Actions
    {
      id: 'action-new-quote',
      label: 'Nova Cotação',
      description: 'Criar uma nova cotação',
      icon: <Plus className="w-4 h-4" />,
      action: () => navigate('/quotes/new'),
      keywords: ['nova', 'criar', 'cotação', 'cotacao', 'new', 'quote', 'abrir', 'iniciar'],
      category: 'actions',
    },
    {
      id: 'action-new-producer',
      label: 'Novo Produtor',
      description: 'Adicionar produtor',
      icon: <Plus className="w-4 h-4" />,
      action: () => navigate('/producers/new'),
      keywords: ['novo', 'criar', 'produtor', 'new', 'producer', 'adicionar', 'cadastrar'],
      category: 'actions',
    },
    {
      id: 'action-new-supplier',
      label: 'Novo Fornecedor',
      description: 'Adicionar fornecedor',
      icon: <Plus className="w-4 h-4" />,
      action: () => navigate('/suppliers/new'),
      keywords: ['novo', 'criar', 'fornecedor', 'new', 'supplier', 'adicionar', 'cadastrar'],
      category: 'actions',
    },
  ];

  // Filter commands based on permissions
  const availableCommands = commands.filter((cmd) => {
    if (cmd.category === 'navigation') {
      const resource = cmd.id.replace('nav-', '').toUpperCase();
      return hasPermission(resource, 'view');
    }
    return true;
  });

  // Filter by search
  const filteredCommands = availableCommands.filter((cmd) => {
    const searchLower = search.toLowerCase();
    return (
      cmd.label.toLowerCase().includes(searchLower) ||
      cmd.description?.toLowerCase().includes(searchLower) ||
      cmd.keywords.some((kw) => kw.toLowerCase().includes(searchLower))
    );
  });

  // Group by category
  const groupedCommands = filteredCommands.reduce<Record<string, Command[]>>((acc, cmd) => {
    if (!acc[cmd.category]) acc[cmd.category] = [];
    acc[cmd.category]?.push(cmd);
    return acc;
  }, {});

  const categoryLabels = {
    navigation: 'Navegação',
    actions: 'Ações',
    settings: 'Configurações',
  };

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filteredCommands.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredCommands.length > 0) {
          const selected = filteredCommands[selectedIndex];
          if (selected) {
            selected.action();
            onClose();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, filteredCommands, onClose]);

  // Reset selected index when search changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  // Reset state when closed
  useEffect(() => {
    if (!isOpen) {
      setSearch('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  const handleCommandClick = (command: Command) => {
    command.action();
    onClose();
  };

  if (!isOpen) return null;

  let commandIndex = 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50 animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Palette */}
      <div className="fixed inset-x-4 top-20 md:left-1/2 md:-translate-x-1/2 md:max-w-2xl z-50 animate-in slide-in-from-top-5 duration-200">
        <div className="bg-background border border-border rounded-lg shadow-2xl overflow-hidden">
          {/* Search Input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <input
              type="text"
              placeholder="Digite para buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              autoFocus
            />
            <kbd className="hidden md:inline-flex items-center gap-1 px-2 py-1 text-xs bg-muted rounded">
              <span>ESC</span>
            </kbd>
          </div>

          {/* Commands List */}
          <div className="max-h-96 overflow-y-auto p-2 custom-scrollbar">
            {filteredCommands.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Nenhum resultado encontrado
              </div>
            ) : (
              Object.entries(groupedCommands).map(([category, cmds]) => (
                <div key={category} className="mb-4 last:mb-0">
                  <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
                    {categoryLabels[category as keyof typeof categoryLabels]}
                  </div>
                  <div className="space-y-1">
                    {cmds.map((cmd) => {
                      const currentIndex = commandIndex++;
                      const isSelected = currentIndex === selectedIndex;

                      return (
                        <button
                          key={cmd.id}
                          onClick={() => handleCommandClick(cmd)}
                          className={cn(
                            'w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors text-left',
                            isSelected
                              ? 'bg-primary text-primary-foreground'
                              : 'hover:bg-secondary text-foreground'
                          )}
                        >
                          <div
                            className={cn(
                              'flex items-center justify-center w-8 h-8 rounded-md',
                              isSelected ? 'bg-primary-foreground/10' : 'bg-secondary'
                            )}
                          >
                            {cmd.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium">{cmd.label}</div>
                            {cmd.description && (
                              <div
                                className={cn(
                                  'text-xs truncate',
                                  isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground'
                                )}
                              >
                                {cmd.description}
                              </div>
                            )}
                          </div>
                          {isSelected && (
                            <kbd className="hidden md:inline-flex items-center gap-1 px-2 py-1 text-xs bg-primary-foreground/10 rounded">
                              ↵
                            </kbd>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-secondary/30 text-xs text-muted-foreground">
            <div className="flex items-center gap-4">
              <span className="hidden md:inline">
                <kbd className="px-1.5 py-0.5 bg-muted rounded">↑↓</kbd> Navegar
              </span>
              <span className="hidden md:inline">
                <kbd className="px-1.5 py-0.5 bg-muted rounded">↵</kbd> Selecionar
              </span>
              <span>
                <kbd className="px-1.5 py-0.5 bg-muted rounded">ESC</kbd> Fechar
              </span>
            </div>
            <span>{filteredCommands.length} resultados</span>
          </div>
        </div>
      </div>
    </>
  );
}

// Hook para controlar o Command Palette
export function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen((prev) => !prev),
  };
}
