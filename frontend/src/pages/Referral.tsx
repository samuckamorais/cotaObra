import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { useToast } from '../hooks/use-toast';
import { api } from '../api/client';
import { useQuery } from '@tanstack/react-query';
import { Gift, Copy, Users, CheckCircle, Share2 } from 'lucide-react';

interface ReferralStats {
  code: string;
  referralUrl: string;
  totalReferred: number;
  totalActivated: number;
  rewardsEarned: number;
  referrals: Array<{
    id: string;
    referredEmail: string;
    status: string;
    createdAt: string;
    activatedAt?: string;
  }>;
}

export function Referral() {
  const [inviteEmail, setInviteEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const { toast } = useToast();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['referral-stats'],
    queryFn: async () => {
      const { data } = await api.get<{ success: boolean; data: ReferralStats }>('/referral/stats');
      return data.data;
    },
  });

  const handleCopyLink = () => {
    if (stats?.referralUrl) {
      navigator.clipboard.writeText(stats.referralUrl);
      toast({ title: 'Link copiado!', variant: 'success' });
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setIsSending(true);
    try {
      await api.post('/referral/create', { email: inviteEmail });
      toast({ title: 'Convite enviado!', variant: 'success' });
      setInviteEmail('');
    } catch {
      toast({ title: 'Erro ao enviar convite', variant: 'destructive' });
    } finally {
      setIsSending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="px-4 py-4 md:px-6 md:py-6 space-y-6">
        <h1 className="text-xl md:text-2xl font-medium text-foreground">Programa de Indicação</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6"><div className="h-16 bg-muted rounded" /></CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 md:px-6 md:py-6 space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-medium text-foreground">Programa de Indicação</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Indique produtores e ganhe benefícios exclusivos
        </p>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
              <Share2 className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats?.totalReferred ?? 0}</p>
              <p className="text-xs text-muted-foreground">Indicados</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 bg-green-100 dark:bg-green-950 rounded-xl flex items-center justify-center">
              <Users className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats?.totalActivated ?? 0}</p>
              <p className="text-xs text-muted-foreground">Ativados</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-100 dark:bg-amber-950 rounded-xl flex items-center justify-center">
              <Gift className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats?.rewardsEarned ?? 0}</p>
              <p className="text-xs text-muted-foreground">Recompensas</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Link de indicação */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Seu link de indicação</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={stats?.referralUrl ?? ''}
              className="flex-1 px-3 py-2 text-sm bg-muted border border-input rounded-md text-muted-foreground"
            />
            <Button onClick={handleCopyLink} variant="outline" className="gap-1.5 shrink-0">
              <Copy className="w-4 h-4" />
              Copiar
            </Button>
          </div>

          <div className="flex gap-2">
            <input
              type="email"
              placeholder="Email do produtor para convidar"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="flex-1 px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button onClick={handleInvite} disabled={isSending || !inviteEmail.trim()} className="shrink-0">
              {isSending ? 'Enviando...' : 'Convidar'}
            </Button>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 text-xs text-muted-foreground space-y-1">
            <p><strong>Como funciona:</strong></p>
            <p>- Você indica, o produtor indicado ganha <strong>desconto de 20%</strong> no primeiro mês</p>
            <p>- Quando ele assinar, você ganha <strong>15 cotações extras</strong> ou <strong>1 mês de desconto</strong> no seu plano</p>
          </div>
        </CardContent>
      </Card>

      {/* Histórico */}
      {stats?.referrals && stats.referrals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Histórico de indicações</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.referrals.map((ref) => (
                <div key={ref.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div>
                    <p className="text-sm font-medium text-foreground">{ref.referredEmail}</p>
                    <p className="text-xs text-muted-foreground">
                      Indicado em {new Date(ref.createdAt).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <Badge variant={ref.status === 'activated' ? 'default' : 'secondary'} className="text-xs gap-1">
                    {ref.status === 'activated' ? (
                      <><CheckCircle className="w-3 h-3" /> Ativado</>
                    ) : (
                      'Pendente'
                    )}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
