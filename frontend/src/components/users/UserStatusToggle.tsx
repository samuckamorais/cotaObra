import { useState } from 'react';
import { useToggleUserStatus } from '../../hooks/useUsers';
import { AlertCircle, CheckCircle, Pause, Play } from 'lucide-react';

interface UserStatusToggleProps {
  userId: string;
  currentStatus: boolean;
  userName: string;
}

export function UserStatusToggle({ userId, currentStatus, userName }: UserStatusToggleProps) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const toggleStatus = useToggleUserStatus();

  const handleToggle = () => {
    setIsConfirmOpen(true);
  };

  const handleConfirm = async () => {
    try {
      await toggleStatus.mutateAsync(userId);
      setIsConfirmOpen(false);
    } catch {
      // Erro tratado pelo toast do mutation
    }
  };

  const handleCancel = () => {
    setIsConfirmOpen(false);
  };

  return (
    <>
      {/* Botão de Toggle */}
      <button
        onClick={handleToggle}
        disabled={toggleStatus.isPending}
        className={`
          inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium
          transition-all duration-200
          ${currentStatus
            ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
            : 'bg-green-100 text-green-700 hover:bg-green-200'
          }
          disabled:opacity-50 disabled:cursor-not-allowed
        `}
        title={currentStatus ? 'Pausar usuário' : 'Reativar usuário'}
      >
        {toggleStatus.isPending ? (
          <>
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            <span>Processando...</span>
          </>
        ) : currentStatus ? (
          <>
            <Pause className="w-4 h-4" />
            <span>Pausar</span>
          </>
        ) : (
          <>
            <Play className="w-4 h-4" />
            <span>Reativar</span>
          </>
        )}
      </button>

      {/* Modal de Confirmação */}
      {isConfirmOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            {/* Ícone de Alerta */}
            <div className="flex items-center gap-3 mb-4">
              {currentStatus ? (
                <div className="flex-shrink-0 w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-yellow-600" />
                </div>
              ) : (
                <div className="flex-shrink-0 w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
              )}
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {currentStatus ? 'Pausar Usuário' : 'Reativar Usuário'}
                </h3>
                <p className="text-sm text-gray-500">Confirme a ação abaixo</p>
              </div>
            </div>

            {/* Mensagem */}
            <div className="mb-6">
              <p className="text-gray-700">
                {currentStatus ? (
                  <>
                    Tem certeza que deseja <strong>pausar</strong> o usuário{' '}
                    <strong className="text-gray-900">{userName}</strong>?
                  </>
                ) : (
                  <>
                    Tem certeza que deseja <strong>reativar</strong> o usuário{' '}
                    <strong className="text-gray-900">{userName}</strong>?
                  </>
                )}
              </p>
              <p className="text-sm text-gray-500 mt-2">
                {currentStatus
                  ? 'O usuário não poderá fazer login até ser reativado.'
                  : 'O usuário poderá fazer login normalmente após a reativação.'}
              </p>
            </div>

            {/* Botões */}
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCancel}
                disabled={toggleStatus.isPending}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirm}
                disabled={toggleStatus.isPending}
                className={`
                  px-4 py-2 text-sm font-medium text-white rounded-md
                  disabled:opacity-50 disabled:cursor-not-allowed
                  ${currentStatus
                    ? 'bg-yellow-600 hover:bg-yellow-700'
                    : 'bg-green-600 hover:bg-green-700'
                  }
                `}
              >
                {toggleStatus.isPending ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Processando...
                  </span>
                ) : (
                  <span>{currentStatus ? 'Pausar' : 'Reativar'}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
