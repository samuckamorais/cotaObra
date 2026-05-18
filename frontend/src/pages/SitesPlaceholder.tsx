import { Construction } from 'lucide-react';

/**
 * CotaObra — Placeholder do módulo Obras (Sites).
 *
 * Renderizado em /sites enquanto o CRUD real (CO-1-10/11/12) não é entregue.
 * Sprint 1 substitui este componente pela tela Sites.tsx + SiteDetail.tsx.
 */
export default function SitesPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-6 text-center">
      <Construction className="size-16 text-muted-foreground" aria-hidden="true" />
      <h1 className="text-2xl font-semibold">Obras — em construção</h1>
      <p className="text-muted-foreground max-w-md">
        O módulo de Obras será habilitado no próximo sprint. Em breve você poderá
        cadastrar suas obras, vincular engenheiros responsáveis e abrir cotações
        diretamente do canteiro.
      </p>
    </div>
  );
}
