import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '../ui/button';
import { X, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useState, useEffect } from 'react';

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  qrCode?: string;
  onRefresh?: () => void;
  isLoading?: boolean;
}

export function QRCodeModal({ isOpen, onClose, qrCode, onRefresh, isLoading }: QRCodeModalProps) {
  const [countdown, setCountdown] = useState(60);

  useEffect(() => {
    if (!isOpen) return;

    setCountdown(60);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, qrCode]);

  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background rounded-lg shadow-lg p-6 w-full max-w-md z-50">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-semibold">Conectar WhatsApp</Dialog.Title>
            <Dialog.Close asChild>
              <button className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>

          <div className="space-y-4">
            <div className="text-sm text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">Como conectar:</p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>Abra o WhatsApp no seu celular</li>
                <li>Toque em Menu ou Configurações</li>
                <li>Toque em Aparelhos conectados</li>
                <li>Toque em Conectar um aparelho</li>
                <li>Escaneie o QR Code abaixo</li>
              </ol>
            </div>

            <div className="flex justify-center items-center p-4 bg-muted/50 rounded-lg min-h-[300px]">
              {isLoading ? (
                <div className="text-center">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Gerando QR Code...</p>
                </div>
              ) : qrCode ? (
                <div className="text-center">
                  <img src={qrCode} alt="QR Code" className="w-64 h-64 mx-auto" />
                  {countdown > 0 ? (
                    <p className="text-xs text-muted-foreground mt-2">Expira em {countdown}s</p>
                  ) : (
                    <div className="mt-2">
                      <p className="text-xs text-destructive mb-2">QR Code expirado</p>
                      <Button onClick={onRefresh} size="sm" variant="outline">
                        <RefreshCw className="w-3 h-3 mr-1" />
                        Gerar novo
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center">
                  <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-2" />
                  <p className="text-sm font-medium">WhatsApp já conectado!</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Você já tem uma sessão ativa
                  </p>
                </div>
              )}
            </div>

            {qrCode && countdown > 0 && onRefresh && (
              <Button onClick={onRefresh} variant="outline" className="w-full" size="sm">
                <RefreshCw className="w-4 h-4 mr-2" />
                Atualizar QR Code
              </Button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
