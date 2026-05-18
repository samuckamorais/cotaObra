import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ShieldCheck, ShieldOff, AlertTriangle, Copy, Check } from 'lucide-react';
import { Button } from '../ui/button';
import { startTotpSetup, confirmTotpSetup, disableTotp } from '../../api/admin';
import { useAuth } from '../../contexts/AuthContext';

/**
 * FEAT-008 (FF-FE-001) — Seção opt-in de 2FA para ADMIN/USER comuns.
 *
 * Para SUPER_ADMIN, 2FA já é obrigatório no enrollment forçado
 * (/admin/2fa-setup) e não pode ser desativado pela UI normal (a
 * desativação seria possível via API, mas como o middleware re-bloqueia
 * o painel admin imediatamente, deixamos o caminho legível só
 * para opt-in voluntário).
 */
export function TwoFactorSection() {
  const { user, setSession, refreshUser } = useAuth();
  const enabled = user?.twoFactorEnabled === true;

  const [secret, setSecret] = useState<string | null>(null);
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [showDisable, setShowDisable] = useState(false);
  const [disableOtp, setDisableOtp] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const startEnroll = async () => {
    setError('');
    setSubmitting(true);
    try {
      const result = await startTotpSetup();
      setSecret(result.secret);
      setOtpauthUrl(result.otpauthUrl);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e.response?.data?.error?.message || 'Erro ao iniciar 2FA.');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmEnroll = async () => {
    if (!secret || !/^\d{6}$/.test(otp)) {
      setError('Digite o código de 6 dígitos do app autenticador.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const result = await confirmTotpSetup(secret, otp);
      setSession(
        { accessToken: result.accessToken, refreshToken: result.refreshToken },
        user ? { ...user, twoFactorEnabled: true } : undefined,
      );
      setSecret(null);
      setOtpauthUrl(null);
      setOtp('');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e.response?.data?.error?.message || 'Código inválido.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDisable = async () => {
    if (!/^\d{6}$/.test(disableOtp)) {
      setError('Digite o código de 6 dígitos para confirmar.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await disableTotp(disableOtp);
      if (user) refreshUser({ ...user, twoFactorEnabled: false });
      setShowDisable(false);
      setDisableOtp('');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e.response?.data?.error?.message || 'Erro ao desativar 2FA.');
    } finally {
      setSubmitting(false);
    }
  };

  const copySecret = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-2">
        {enabled ? (
          <ShieldCheck className="w-5 h-5 text-green-600" />
        ) : (
          <ShieldOff className="w-5 h-5 text-muted-foreground" />
        )}
        <h2 className="text-base font-semibold">Autenticação em duas etapas (2FA)</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        {enabled
          ? 'Sua conta está protegida com 2FA via app autenticador (TOTP).'
          : 'Adicione uma camada extra de proteção: ao logar, vai pedir um código de 6 dígitos do seu app autenticador (Google Authenticator, Authy, 1Password).'}
      </p>

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 mb-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-destructive mt-0.5" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Status: ativo → opção de desativar */}
      {enabled && !showDisable && (
        <Button variant="outline" onClick={() => setShowDisable(true)}>
          Desativar 2FA
        </Button>
      )}

      {enabled && showDisable && (
        <div className="space-y-3">
          <p className="text-sm">
            Digite o código atual do app autenticador para confirmar:
          </p>
          <input
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            value={disableOtp}
            onChange={(e) => setDisableOtp(e.target.value.replace(/\D/g, ''))}
            className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm text-center font-mono text-lg tracking-widest"
            placeholder="000000"
          />
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowDisable(false);
                setDisableOtp('');
                setError('');
              }}
              disabled={submitting}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleDisable}
              disabled={submitting || disableOtp.length !== 6}
              className="flex-1"
            >
              {submitting ? 'Desativando...' : 'Confirmar desativação'}
            </Button>
          </div>
        </div>
      )}

      {/* Status: inativo → fluxo de enrollment */}
      {!enabled && !secret && (
        <Button onClick={startEnroll} disabled={submitting}>
          {submitting ? 'Gerando QR...' : 'Ativar 2FA'}
        </Button>
      )}

      {!enabled && secret && otpauthUrl && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="bg-white p-3 rounded-lg border self-start">
              <QRCodeSVG value={otpauthUrl} size={160} />
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground mb-2">
                Escaneie o QR no seu app, ou digite esta chave manualmente:
              </p>
              <div className="flex gap-2">
                <code className="flex-1 px-3 py-2 bg-muted rounded text-xs font-mono break-all">
                  {secret}
                </code>
                <Button variant="outline" size="icon" onClick={copySecret}>
                  {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>
          <div>
            <p className="text-sm font-medium mb-2">
              Digite o código de 6 dígitos do app:
            </p>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm text-center font-mono text-lg tracking-widest"
              placeholder="000000"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setSecret(null);
                setOtpauthUrl(null);
                setOtp('');
                setError('');
              }}
              disabled={submitting}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={confirmEnroll}
              disabled={submitting || otp.length !== 6}
              className="flex-1"
            >
              {submitting ? 'Confirmando...' : 'Confirmar e ativar'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
