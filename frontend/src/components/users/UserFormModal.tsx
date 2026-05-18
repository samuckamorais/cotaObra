import { useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { useCreateUser, useUpdateUser } from '../../hooks/useUsers';
import { useProducers } from '../../hooks/useProducers';
import { useToast } from '../../hooks/use-toast';
import { X } from 'lucide-react';

interface UserPermission {
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
  producerId?: string | null;
  permissions?: UserPermission[];
}

interface UserFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  user?: UserData | null;
}

const RESOURCES = [
  { value: 'DASHBOARD', label: 'Dashboard' },
  { value: 'QUOTES', label: 'Cotações' },
  { value: 'SUPPLIERS', label: 'Fornecedores' },
  { value: 'PRODUCERS', label: 'Produtores' },
  { value: 'SUBSCRIPTIONS', label: 'Assinaturas' },
  { value: 'USERS', label: 'Usuários' },
];

export function UserFormModal({ isOpen, onClose, user }: UserFormModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'USER' as 'ADMIN' | 'USER',
    active: true,
    producerId: '' as string,
  });

  const { data: producersData } = useProducers(1, 100);

  const [permissions, setPermissions] = useState<
    Record<
      string,
      { canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean }
    >
  >({});

  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        email: user.email || '',
        password: '',
        role: user.role || 'USER',
        active: user.active !== undefined ? user.active : true,
        producerId: user.producerId || '',
      });

      // Carregar permissões
      const userPermissions: Record<string, { canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean }> = {};
      RESOURCES.forEach((resource) => {
        const permission = user.permissions?.find((p) => p.resource === resource.value);
        userPermissions[resource.value] = {
          canView: permission?.canView || false,
          canCreate: permission?.canCreate || false,
          canEdit: permission?.canEdit || false,
          canDelete: permission?.canDelete || false,
        };
      });
      setPermissions(userPermissions);
    } else {
      setFormData({
        name: '',
        email: '',
        password: '',
        role: 'USER',
        active: true,
        producerId: '',
      });

      // Inicializar permissões vazias
      const emptyPermissions: Record<string, { canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean }> = {};
      RESOURCES.forEach((resource) => {
        emptyPermissions[resource.value] = {
          canView: false,
          canCreate: false,
          canEdit: false,
          canDelete: false,
        };
      });
      setPermissions(emptyPermissions);
    }
  }, [user, isOpen]);

  const handleTogglePermission = (
    resource: string,
    action: 'canView' | 'canCreate' | 'canEdit' | 'canDelete'
  ) => {
    setPermissions((prev) => ({
      ...prev,
      [resource]: {
        canView: prev[resource]?.canView || false,
        canCreate: prev[resource]?.canCreate || false,
        canEdit: prev[resource]?.canEdit || false,
        canDelete: prev[resource]?.canDelete || false,
        [action]: !prev[resource]?.[action],
      },
    }));
  };

  const handleToggleAll = (resource: string, enabled: boolean) => {
    setPermissions((prev) => ({
      ...prev,
      [resource]: {
        canView: enabled,
        canCreate: enabled,
        canEdit: enabled,
        canDelete: enabled,
      },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Preparar permissões
    const permissionsArray = Object.entries(permissions)
      .filter(([_, perms]) => Object.values(perms).some((v) => v)) // Apenas recursos com pelo menos uma permissão
      .map(([resource, perms]) => ({
        resource,
        ...perms,
      }));

    const payload = {
      name: formData.name,
      email: formData.email,
      role: formData.role,
      active: formData.active,
      producerId: formData.role === 'USER' && formData.producerId ? formData.producerId : null,
      ...(formData.password ? { password: formData.password } : {}),
      ...(formData.role !== 'ADMIN' ? { permissions: permissionsArray } : {}),
    };

    try {
      if (user) {
        await updateMutation.mutateAsync({ id: user.id, data: payload });
        toast({ title: 'Usuário atualizado com sucesso!', variant: 'success' });
      } else {
        if (!formData.password) {
          toast({ title: 'Senha obrigatória', description: 'Informe uma senha para o novo usuário.', variant: 'destructive' });
          return;
        }
        await createMutation.mutateAsync({ ...payload, password: formData.password });
        toast({ title: 'Usuário cadastrado com sucesso!', variant: 'success' });
      }
      onClose();
    } catch (error: unknown) {
      const axiosErr = error as { response?: { data?: { error?: { message?: string; details?: Array<{ field: string; message: string }> }; message?: string } } };
      const details = axiosErr.response?.data?.error?.details;
      const message = axiosErr.response?.data?.error?.message || axiosErr.response?.data?.message || 'Erro ao salvar usuário';
      const description = details?.length
        ? details.map((d) => `${d.field}: ${d.message}`).join(' · ')
        : undefined;
      toast({ title: message, description, variant: 'destructive' });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border sticky top-0 bg-background z-10">
          <h2 className="text-2xl font-bold text-foreground">
            {user ? 'Editar Usuário' : 'Novo Usuário'}
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Informações Básicas */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground">Informações Básicas</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Nome */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Nome <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 text-foreground bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Ex: João Silva"
                />
              </div>

              {/* E-mail */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  E-mail <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 text-foreground bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="usuario@exemplo.com"
                />
              </div>

              {/* Senha */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Senha {!user && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="password"
                  required={!user}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 text-foreground bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder={user ? 'Deixe em branco para manter' : 'Mínimo 6 caracteres'}
                />
                {user && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Deixe em branco para não alterar a senha
                  </p>
                )}
              </div>

              {/* Perfil */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Perfil <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.role}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      role: e.target.value as 'ADMIN' | 'USER',
                      producerId: '',
                    })
                  }
                  className="w-full px-3 py-2 text-foreground bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="USER">Usuário</option>
                  <option value="ADMIN">Administrador</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Administradores têm acesso total ao sistema
                </p>
              </div>

              {/* Produtor vinculado — apenas para USER */}
              {formData.role === 'USER' && (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Produtor responsável
                  </label>
                  <select
                    value={formData.producerId}
                    onChange={(e) => setFormData({ ...formData, producerId: e.target.value })}
                    className="w-full px-3 py-2 text-foreground bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">— Sem vínculo (acesso geral) —</option>
                    {producersData?.data?.map((p: { id: string; name: string; city: string }) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {p.city}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Cada produtor pode ser vinculado a no máximo um usuário
                  </p>
                </div>
              )}
            </div>

            {/* Status */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="active"
                checked={formData.active}
                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              <label htmlFor="active" className="text-sm font-medium text-foreground">
                Usuário ativo
              </label>
            </div>
          </div>

          {/* Permissões (apenas para USER) */}
          {formData.role === 'USER' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-foreground">Permissões</h3>
                <p className="text-sm text-muted-foreground">
                  Selecione as permissões para cada módulo
                </p>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                        Módulo
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase">
                        Visualizar
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase">
                        Criar
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase">
                        Editar
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase">
                        Excluir
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase">
                        Todas
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {RESOURCES.map((resource) => {
                      const perms = permissions[resource.value] || {
                        canView: false,
                        canCreate: false,
                        canEdit: false,
                        canDelete: false,
                      };
                      const allEnabled =
                        perms.canView && perms.canCreate && perms.canEdit && perms.canDelete;

                      return (
                        <tr key={resource.value} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-foreground">
                            {resource.label}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={perms.canView}
                              onChange={() =>
                                handleTogglePermission(resource.value, 'canView')
                              }
                              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={perms.canCreate}
                              onChange={() =>
                                handleTogglePermission(resource.value, 'canCreate')
                              }
                              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={perms.canEdit}
                              onChange={() =>
                                handleTogglePermission(resource.value, 'canEdit')
                              }
                              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={perms.canDelete}
                              onChange={() =>
                                handleTogglePermission(resource.value, 'canDelete')
                              }
                              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={allEnabled}
                              onChange={(e) =>
                                handleToggleAll(resource.value, e.target.checked)
                              }
                              className="w-4 h-4 text-green-600 rounded focus:ring-2 focus:ring-green-500"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Ações */}
          <div className="flex gap-3 pt-4 border-t border-border sticky bottom-0 bg-background">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending
                ? 'Salvando...'
                : user
                ? 'Salvar Alterações'
                : 'Cadastrar Usuário'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
