import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { useUsers, useDeleteUser } from '../hooks/useUsers';
import { formatDate } from '../lib/utils';
import { useToast } from '../hooks/use-toast';
import { ConfirmModal } from '../components/ui/confirm-modal';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Edit,
  Trash2,
  User as UserIcon,
  Mail,
  Shield,
  ShieldCheck,
  Eye,
  CheckCircle,
  XCircle,
  Search,
  Filter,
} from 'lucide-react';
import { UserFormModal } from '../components/users/UserFormModal';
import { UserStatusToggle } from '../components/users/UserStatusToggle';
import { useAuth } from '../contexts/AuthContext';

interface Permission {
  id?: string;
  resource: string;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

interface UserData {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'USER';
  active: boolean;
  createdAt: string;
  producerId?: string | null;
  producer?: { id: string; name: string; city: string } | null;
  permissions: Permission[];
}

type RoleFilter = 'ALL' | 'ADMIN' | 'USER';
type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';

export function Users() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const limit = 12;

  const { data, isLoading, error } = useUsers(page, limit);
  const deleteMutation = useDeleteUser();
  const { isAdmin } = useAuth();
  const { toast } = useToast();

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteMutation.mutateAsync(confirmDelete.id);
      toast({ title: 'Usuário excluído com sucesso!', variant: 'success' });
      setConfirmDelete(null);
    } catch {
      toast({ title: 'Erro ao excluir usuário', description: 'Tente novamente.', variant: 'destructive' });
    }
  };

  const handleEdit = (user: UserData) => {
    setEditingUser(user);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingUser(null);
  };

  if (isLoading) {
    return (
      <div className="px-4 py-4 md:px-6 md:py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-medium text-foreground">Usuários</h1>
            <p className="text-sm text-muted-foreground mt-1">Gerencie usuários e permissões</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-5 bg-muted rounded w-3/4 mb-2" />
                <div className="h-4 bg-muted rounded w-1/2" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-3 bg-muted rounded w-full" />
                  <div className="h-3 bg-muted rounded w-3/4" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-4 md:px-6 md:py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-medium text-foreground">Usuários</h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie usuários e permissões</p>
        </div>
        <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4">
          <p className="text-sm text-destructive">Erro ao carregar usuários</p>
        </div>
      </div>
    );
  }

  const allUsers: UserData[] = data?.data || [];
  const pagination = data?.pagination;

  // Filtros client-side (search + role + status)
  const users = allUsers.filter((u) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!u.name?.toLowerCase().includes(q) && !u.email?.toLowerCase().includes(q)) {
        return false;
      }
    }
    if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
    if (statusFilter === 'ACTIVE' && !u.active) return false;
    if (statusFilter === 'INACTIVE' && u.active) return false;
    return true;
  });

  return (
    <div className="px-4 py-4 md:px-6 md:py-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-medium text-foreground">Usuários</h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie usuários e permissões</p>
        </div>
        {isAdmin() && (
          <Button onClick={() => setIsModalOpen(true)} className="gap-2 self-start sm:self-auto shrink-0">
            <Plus className="w-3.5 h-3.5" />
            Novo Usuário
          </Button>
        )}
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por nome ou e-mail..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="flex gap-2">
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
              className="text-sm bg-background border border-input rounded-md px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="ALL">Todos os perfis</option>
              <option value="ADMIN">Admin</option>
              <option value="USER">Usuário</option>
            </select>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="text-sm bg-background border border-input rounded-md px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="ALL">Todos os status</option>
            <option value="ACTIVE">Ativos</option>
            <option value="INACTIVE">Inativos</option>
          </select>
        </div>
      </div>

      {/* Empty State */}
      {users.length === 0 ? (
        <Card className="p-16 text-center">
          <UserIcon className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-base font-medium text-foreground mb-2">
            {search || roleFilter !== 'ALL' || statusFilter !== 'ALL'
              ? 'Nenhum resultado encontrado'
              : 'Nenhum usuário cadastrado'}
          </h3>
          <p className="text-sm text-muted-foreground mb-6">
            {search
              ? `Nenhum usuário corresponde a "${search}"`
              : 'Cadastre o primeiro usuário para começar'}
          </p>
          {isAdmin() && !search && roleFilter === 'ALL' && statusFilter === 'ALL' && (
            <Button onClick={() => setIsModalOpen(true)} className="gap-2">
              <Plus className="w-3.5 h-3.5" />
              Cadastrar Usuário
            </Button>
          )}
        </Card>
      ) : (
        <>
          {/* Grid de Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {users.map((user) => (
              <Card key={user.id} className="hover:bg-secondary/50 transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <CardTitle className="text-base font-medium">
                          {user.name}
                        </CardTitle>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {user.role === 'ADMIN' ? (
                          <Badge variant="default" className="text-xs gap-1">
                            <ShieldCheck className="w-3 h-3" />
                            Admin
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Shield className="w-3 h-3" />
                            Usuário
                          </Badge>
                        )}
                        {user.active ? (
                          <Badge variant="outline" className="text-xs gap-1 bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-800">
                            <CheckCircle className="w-3 h-3" />
                            Ativo
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs gap-1 bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-700">
                            <XCircle className="w-3 h-3" />
                            Inativo
                          </Badge>
                        )}
                      </div>
                    </div>
                    {isAdmin() && (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(user)}
                          className="h-8 w-8 p-0"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmDelete({ id: user.id, name: user.name })}
                          disabled={deleteMutation.isPending}
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Mail className="w-3.5 h-3.5" />
                      <span className="truncate">{user.email}</span>
                    </div>
                    {user.producer && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <UserIcon className="w-3.5 h-3.5" />
                        <span className="truncate">{user.producer.name} — {user.producer.city}</span>
                      </div>
                    )}
                  </div>

                  {/* Permissões */}
                  {user.role !== 'ADMIN' && user.permissions && user.permissions.length > 0 && (
                    <div className="pt-3 border-t border-border">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Permissões:</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {user.permissions.slice(0, 3).map((permission) => (
                          <Badge key={permission.id} variant="secondary" className="text-xs">
                            {permission.resource}
                          </Badge>
                        ))}
                        {user.permissions.length > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{user.permissions.length - 3}
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="text-xs text-muted-foreground pt-2 border-t border-border">
                    Cadastrado em {formatDate(user.createdAt)}
                  </div>

                  {isAdmin() && (
                    <div className="pt-3 border-t border-border flex justify-center">
                      <UserStatusToggle
                        userId={user.id}
                        currentStatus={user.active}
                        userName={user.name}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Paginação */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground">
                Página {pagination.page} de {pagination.totalPages} — {pagination.total} usuários
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Anterior</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page === pagination.totalPages}
                  className="gap-1"
                >
                  <span className="hidden sm:inline">Próxima</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal de cadastro/edição */}
      <UserFormModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        user={editingUser}
      />

      <ConfirmModal
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        title="Excluir usuário"
        description={`Tem certeza que deseja excluir "${confirmDelete?.name}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
