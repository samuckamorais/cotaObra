/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_ANALYTICS_ENABLED: string;
  readonly VITE_ANALYTICS_PROVIDER: 'plausible' | 'custom' | 'none';
  readonly VITE_ANALYTICS_SITE_ID?: string;
  readonly VITE_ANALYTICS_ENDPOINT?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SENTRY_ENVIRONMENT?: string;
  readonly VITE_ENABLE_DEVTOOLS?: string;
  readonly VITE_ENABLE_PERFORMANCE_MONITORING?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Analytics types
interface Window {
  plausible?: (event: string, options?: { props?: Record<string, any> }) => void;
}
