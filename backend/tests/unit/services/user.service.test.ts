jest.mock('../../../src/config/database', () => ({
  prisma: {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    producer: {
      findUnique: jest.fn(),
    },
    permission: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { UserService } from '../../../src/modules/users/user.service';
import { prisma } from '../../../src/config/database';

const mockUserFindMany = prisma.user.findMany as jest.Mock;
const mockUserFindUnique = prisma.user.findUnique as jest.Mock;
const mockUserFindFirst = prisma.user.findFirst as jest.Mock;
const mockUserCreate = prisma.user.create as jest.Mock;
const mockUserUpdate = prisma.user.update as jest.Mock;
const mockUserDelete = prisma.user.delete as jest.Mock;
const mockUserCount = prisma.user.count as jest.Mock;
const mockProducerFindUnique = (prisma as any).producer.findUnique as jest.Mock;
const sampleUser = {
  id: 'user-1', name: 'João', email: 'joao@farm.com',
  role: 'ADMIN', active: true, createdAt: new Date(), updatedAt: new Date(),
  producerId: null, producer: null, permissions: [],
};

beforeEach(() => jest.resetAllMocks());

describe('UserService', () => {
  describe('list', () => {
    it('retorna usuários paginados', async () => {
      mockUserFindMany.mockResolvedValue([sampleUser]);
      mockUserCount.mockResolvedValue(1);

      const result = await UserService.list(1, 10, 'tenant-1');

      expect(result.data).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
      expect(result.pagination.page).toBe(1);
    });

    it('aplica filtro de busca', async () => {
      mockUserFindMany.mockResolvedValue([]);
      mockUserCount.mockResolvedValue(0);

      await UserService.list(1, 10, 'tenant-1', { search: 'joao' });

      const whereArg = mockUserFindMany.mock.calls[0][0].where;
      expect(whereArg.OR).toBeDefined();
      expect(whereArg.OR).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: expect.objectContaining({ contains: 'joao' }) }),
        ]),
      );
    });
  });

  describe('getById', () => {
    it('retorna usuário', async () => {
      mockUserFindUnique.mockResolvedValue(sampleUser);

      const result = await UserService.getById('user-1');
      expect(result.id).toBe('user-1');
    });

    it('lança 404 para usuário inexistente', async () => {
      mockUserFindUnique.mockResolvedValue(null);

      await expect(UserService.getById('fake-id')).rejects.toThrow('Usuário não encontrado');
    });
  });

  describe('create', () => {
    it('cria usuário com senha hasheada', async () => {
      mockUserFindUnique.mockResolvedValue(null); // email não existe
      mockUserCreate.mockResolvedValue(sampleUser);

      const result = await UserService.create({
        name: 'João', email: 'joao@farm.com', password: 'senha123',
      });

      expect(mockUserCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ password: expect.any(String) }),
        }),
      );
      // Verifica que a senha foi hasheada (não é a original)
      const calledData = mockUserCreate.mock.calls[0][0].data;
      expect(calledData.password).not.toBe('senha123');
      expect(result.id).toBe('user-1');
    });

    it('lança conflito para email duplicado', async () => {
      mockUserFindUnique.mockResolvedValue(sampleUser); // email já existe

      await expect(
        UserService.create({ name: 'X', email: 'joao@farm.com', password: '123' }),
      ).rejects.toThrow('E-mail já cadastrado');
    });

    it('lança conflito para producerId já vinculado', async () => {
      // Primeiro findUnique (email) retorna null, segundo (producer) retorna ok,
      // terceiro (user by producerId) retorna existente
      mockUserFindUnique
        .mockResolvedValueOnce(null) // email check
        .mockResolvedValueOnce({ id: 'other-user' }); // producerId already linked
      mockProducerFindUnique.mockResolvedValue({ id: 'prod-1' });

      await expect(
        UserService.create({
          name: 'X', email: 'new@farm.com', password: '123', producerId: 'prod-1',
        }),
      ).rejects.toThrow('já está vinculado');
    });
  });

  describe('update', () => {
    it('atualiza campos do usuário', async () => {
      // getById inside update
      mockUserFindUnique.mockResolvedValue(sampleUser);
      mockUserUpdate.mockResolvedValue({ ...sampleUser, name: 'João Atualizado' });

      const result = await UserService.update('user-1', { name: 'João Atualizado' });
      expect(mockUserUpdate).toHaveBeenCalled();
      expect(result.id).toBe('user-1');
    });

    it('lança conflito para email duplicado em update', async () => {
      mockUserFindUnique.mockResolvedValue(sampleUser); // getById
      mockUserFindFirst.mockResolvedValue({ id: 'other-user' }); // email já existe

      await expect(
        UserService.update('user-1', { email: 'taken@farm.com' }),
      ).rejects.toThrow('E-mail já cadastrado');
    });
  });

  describe('delete', () => {
    it('deleta usuário', async () => {
      mockUserFindUnique.mockResolvedValue(sampleUser);
      mockUserDelete.mockResolvedValue(sampleUser);

      await UserService.delete('user-1');

      expect(mockUserDelete).toHaveBeenCalledWith({ where: { id: 'user-1' } });
    });
  });

  describe('toggleStatus', () => {
    it('alterna status do usuário', async () => {
      mockUserFindUnique.mockResolvedValue({
        id: 'user-2', active: true, role: 'USER', tenantId: 't1',
      });
      mockUserCount.mockResolvedValue(2); // não é último admin
      mockUserUpdate.mockResolvedValue({ ...sampleUser, id: 'user-2', active: false });

      await UserService.toggleStatus('user-2', 'user-1');
      expect(mockUserUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-2' },
          data: { active: false },
        }),
      );
    });

    it('impede auto-desativação', async () => {
      mockUserFindUnique.mockResolvedValue({
        id: 'user-1', active: true, role: 'ADMIN', tenantId: 't1',
      });

      await expect(
        UserService.toggleStatus('user-1', 'user-1'),
      ).rejects.toThrow('não pode desativar sua própria conta');
    });

    it('impede desativar último admin', async () => {
      mockUserFindUnique.mockResolvedValue({
        id: 'user-2', active: true, role: 'ADMIN', tenantId: 't1',
      });
      mockUserCount.mockResolvedValue(1); // único admin

      await expect(
        UserService.toggleStatus('user-2', 'user-1'),
      ).rejects.toThrow('último administrador');
    });
  });
});
