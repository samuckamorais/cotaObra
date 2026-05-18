/**
 * Error Boundary Component
 *
 * Catches React errors and displays user-friendly fallback UI.
 * Follows the clean, minimal design system (Linear-inspired).
 */

import { Component, ReactNode } from 'react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { AlertTriangle } from 'lucide-react';
import { logError } from '../lib/logger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: any;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    // Log error to console and analytics
    logError('ErrorBoundary', error, {
      componentStack: errorInfo.componentStack,
    });

    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });

    if (this.props.onReset) {
      this.props.onReset();
    } else {
      // Default: reload page
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div className="flex items-center justify-center min-h-[400px] p-6">
          <Card className="max-w-md w-full p-6 text-center">
            <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-amber-500" />
            <h2 className="text-lg font-medium text-foreground mb-2">Algo deu errado</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Desculpe, ocorreu um erro inesperado. Tente recarregar a página.
            </p>

            {/* Show error details in dev mode */}
            {import.meta.env.DEV && this.state.error && (
              <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md text-left">
                <p className="text-xs font-mono text-destructive">
                  {this.state.error.toString()}
                </p>
              </div>
            )}

            <Button onClick={this.handleReset} variant="outline">
              Tentar novamente
            </Button>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Simplified error fallback for inline usage
 */
export function ErrorFallback({ resetError }: { error?: Error; resetError: () => void }) {
  return (
    <div className="flex items-center justify-center min-h-[200px] p-4">
      <div className="text-center">
        <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-amber-500" />
        <p className="text-sm text-muted-foreground mb-3">Erro ao carregar conteúdo</p>
        <Button size="sm" variant="outline" onClick={resetError}>
          Tentar novamente
        </Button>
      </div>
    </div>
  );
}
