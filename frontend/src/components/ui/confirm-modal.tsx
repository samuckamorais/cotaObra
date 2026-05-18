import { useState, useEffect } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { Button } from './button';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: 'danger' | 'warning';
  isLoading?: boolean;
  /** When set, user must type this text to enable confirm button (case-insensitive) */
  confirmText?: string;
  /** Delay in seconds before confirm button enables (default: 0) */
  delaySeconds?: number;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirmar',
  variant = 'danger',
  isLoading = false,
  confirmText,
  delaySeconds = 0,
}: ConfirmModalProps) {
  const [typedText, setTypedText] = useState('');
  const [countdown, setCountdown] = useState(delaySeconds);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setTypedText('');
      setCountdown(delaySeconds);
    }
  }, [isOpen, delaySeconds]);

  // Countdown timer
  useEffect(() => {
    if (!isOpen || countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen, countdown]);

  if (!isOpen) return null;

  const isDanger = variant === 'danger';
  const textMatch = !confirmText || typedText.toLowerCase() === confirmText.toLowerCase();
  const timerDone = countdown <= 0;
  const canConfirm = textMatch && timerDone && !isLoading;

  let buttonLabel = confirmLabel;
  if (isLoading) {
    buttonLabel = 'Aguarde...';
  } else if (!timerDone) {
    buttonLabel = `Aguarde (${countdown}s)`;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-sm border border-border">
        {/* Header */}
        <div className="flex items-start justify-between p-5 pb-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                isDanger
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400'
              }`}
            >
              {isDanger ? <Trash2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            </div>
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="text-muted-foreground hover:text-foreground transition ml-2 flex-shrink-0"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 pb-4">
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>

        {/* Critical: text confirmation input */}
        {confirmText && (
          <div className="px-5 pb-4">
            <label className="block text-xs text-muted-foreground mb-1.5">
              Digite <strong className="text-foreground">{confirmText}</strong> para confirmar
            </label>
            <input
              type="text"
              value={typedText}
              onChange={(e) => setTypedText(e.target.value)}
              placeholder={confirmText}
              className="w-full px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 px-5 pb-5 justify-end">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={onConfirm}
            disabled={!canConfirm}
            className={
              isDanger
                ? 'bg-destructive hover:bg-destructive/90 text-white disabled:opacity-50'
                : ''
            }
          >
            {buttonLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
