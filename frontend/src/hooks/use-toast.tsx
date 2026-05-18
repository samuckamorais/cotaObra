import * as React from 'react';
import { CheckCircle, XCircle, AlertCircle, Info } from 'lucide-react';

export type ToastVariant = 'default' | 'destructive' | 'success' | 'warning' | 'info';

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

interface ToastContextValue {
  toasts: Toast[];
  toast: (props: Omit<Toast, 'id'>) => void;
  dismiss: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const toast = React.useCallback((props: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    const duration = props.duration || 5000;
    const newToast: Toast = {
      ...props,
      id,
      variant: props.variant || 'default',
      duration
    };

    setToasts((prev) => [...prev, newToast]);

    // Auto dismiss after duration
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;

  const getToastStyles = (variant: ToastVariant) => {
    switch (variant) {
      case 'success':
        return 'bg-[hsl(var(--success-bg))] border-[hsl(var(--success))]/20 text-[hsl(var(--success))]';
      case 'destructive':
        return 'bg-[hsl(var(--error-bg))] border-[hsl(var(--error))]/20 text-[hsl(var(--error))]';
      case 'warning':
        return 'bg-[hsl(var(--warning-bg))] border-[hsl(var(--warning))]/20 text-[hsl(var(--warning))]';
      case 'info':
        return 'bg-[hsl(var(--info-bg))] border-[hsl(var(--info))]/20 text-[hsl(var(--info))]';
      default:
        return 'bg-background border-border text-foreground';
    }
  };

  const getIcon = (variant: ToastVariant) => {
    switch (variant) {
      case 'success':
        return <CheckCircle className="w-5 h-5 flex-shrink-0" />;
      case 'destructive':
        return <XCircle className="w-5 h-5 flex-shrink-0" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5 flex-shrink-0" />;
      case 'info':
        return <Info className="w-5 h-5 flex-shrink-0" />;
      default:
        return null;
    }
  };

  return (
    <div className="fixed top-4 right-4 z-50 w-full md:max-w-md p-4 pointer-events-none">
      <div className="flex flex-col gap-2">
        {toasts.map((toast) => {
          const Icon = getIcon(toast.variant || 'default');
          const duration = toast.duration || 5000;

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto rounded-lg shadow-lg border-0.5 overflow-hidden animate-in slide-in-from-top-5 ${getToastStyles(
                toast.variant || 'default'
              )}`}
            >
              <div className="p-4">
                <div className="flex items-start gap-3">
                  {Icon && <div className="mt-0.5">{Icon}</div>}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{toast.title}</div>
                    {toast.description && (
                      <div className="text-sm opacity-90 mt-1">{toast.description}</div>
                    )}
                  </div>
                  <button
                    onClick={() => onDismiss(toast.id)}
                    className="opacity-70 hover:opacity-100 transition-opacity flex-shrink-0"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                </div>
              </div>
              {/* Progress bar */}
              <div
                className="h-1 bg-current opacity-30"
                style={{
                  animation: `shrink ${duration}ms linear forwards`
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
