import {
  useSupplierStatus,
  type SupplierDeliveryStatus,
  type SupplierStatusItem,
} from '../../hooks/useSupplierStatus';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import {
  Send,
  CheckCircle2,
  Eye,
  MessageSquare,
  AlertCircle,
  Clock,
} from 'lucide-react';

interface Props {
  quoteId: string;
}

const STATUS_META: Record<
  SupplierDeliveryStatus,
  { label: string; className: string; Icon: typeof Send }
> = {
  PENDING: {
    label: 'Pendente',
    className: 'bg-gray-100 text-gray-700',
    Icon: Clock,
  },
  SENT: { label: 'Enviada', className: 'bg-blue-100 text-blue-700', Icon: Send },
  DELIVERED: {
    label: 'Entregue',
    className: 'bg-cyan-100 text-cyan-700',
    Icon: CheckCircle2,
  },
  READ: { label: 'Lida', className: 'bg-indigo-100 text-indigo-700', Icon: Eye },
  RESPONDED: {
    label: 'Respondeu',
    className: 'bg-green-100 text-green-700',
    Icon: MessageSquare,
  },
  FAILED: {
    label: 'Falha',
    className: 'bg-red-100 text-red-700',
    Icon: AlertCircle,
  },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/**
 * CO-3-09 — Grid em tempo real (polling 15s) dos fornecedores convidados.
 * Mostra status de delivery + indicador "X/Y responderam".
 */
export function SupplierStatusGrid({ quoteId }: Props) {
  const { data, isLoading, error } = useSupplierStatus(quoteId);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground animate-pulse">
            Carregando status dos fornecedores…
          </p>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          Erro ao carregar status dos fornecedores.
        </CardContent>
      </Card>
    );
  }

  if (data.items.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          Nenhum fornecedor foi notificado ainda. Use "Disparar" no detalhe da
          cotação para enviar via WhatsApp.
        </CardContent>
      </Card>
    );
  }

  const { summary, items } = data;

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-medium">Fornecedores convidados</h3>
          <div className="text-sm font-medium">
            <span className="text-green-700">{summary.responded}</span>
            <span className="text-muted-foreground"> / {summary.total} responderam</span>
            {summary.failed > 0 && (
              <span className="text-red-700 ml-2">· {summary.failed} falha(s)</span>
            )}
          </div>
        </div>

        <div className="space-y-2">
          {items.map((item) => (
            <SupplierStatusRow key={item.notificationId} item={item} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SupplierStatusRow({ item }: { item: SupplierStatusItem }) {
  const meta = STATUS_META[item.deliveryStatus];
  const Icon = meta.Icon;

  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="font-medium truncate">{item.supplierName}</p>
        {item.supplierCompany && (
          <p className="text-xs text-muted-foreground truncate">
            {item.supplierCompany}
          </p>
        )}
        <p className="text-xs text-muted-foreground">{item.supplierPhone}</p>
      </div>

      <div className="flex flex-col items-end gap-1">
        <Badge className={`${meta.className} flex items-center gap-1`}>
          <Icon className="size-3" />
          {meta.label}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {timeAgo(item.notifiedAt)}
          {item.followUpCount > 0 && ` · ${item.followUpCount} lembrete(s)`}
        </span>
        {item.errorMsg && (
          <span className="text-xs text-red-700 max-w-[200px] truncate" title={item.errorMsg}>
            {item.errorMsg}
          </span>
        )}
      </div>
    </div>
  );
}
