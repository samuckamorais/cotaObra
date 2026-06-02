/**
 * CotaObra Logo Components
 *
 * LogoMark  — apenas o ícone (usado em sidebar, mobile header, favicons)
 * LogoFull  — ícone + logotipo "COTAOBRA" (usado na tela de login)
 *
 * Brand:
 *   Âmbar  #F0B429  — metade esquerda do anel + prédio menor
 *   Verde  #4CAF50  — metade direita do anel + prédio maior
 *
 * Conceito: anel de cotação + silhueta de obra/prédios no centro.
 */

interface LogoMarkProps {
  /** Tamanho do ícone quadrado em px. Padrão: 32 */
  size?: number;
  className?: string;
}

export function LogoMark({ size = 32, className }: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="CotaObra"
    >
      {/* ── Anel esquerdo — âmbar ── */}
      <path
        d="M 50 7 A 43 43 0 0 0 50 93 L 50 75 A 25 25 0 0 1 50 25 Z"
        fill="#F0B429"
      />
      {/* ── Anel direito — verde ── */}
      <path
        d="M 50 7 A 43 43 0 0 1 50 93 L 50 75 A 25 25 0 0 0 50 25 Z"
        fill="#4CAF50"
      />

      {/* ── Skyline interno: 3 prédios estilizados (silhueta de obra) ── */}
      {/* Prédio esquerdo — médio, âmbar */}
      <rect x="31" y="48" width="13" height="29" rx="1" fill="#F0B429" />
      {/* Prédio central — mais alto, verde (cor principal da brand) */}
      <rect x="45" y="35" width="14" height="42" rx="1" fill="#4CAF50" />
      {/* Prédio direito — baixo, âmbar */}
      <rect x="60" y="54" width="11" height="23" rx="1" fill="#F0B429" />

      {/* Pequeno detalhe topo do prédio central (antena/guincho) */}
      <rect x="51" y="29" width="2" height="7" fill="#4CAF50" />
    </svg>
  );
}

interface LogoFullProps {
  /** Tamanho do ícone. O texto é proporcional. Padrão: 48 */
  iconSize?: number;
  /** Cor do texto COTAOBRA. Padrão: currentColor (herda do tema) */
  textColor?: string;
  className?: string;
  /** Orientação: 'horizontal' (ícone + texto lado a lado) ou 'vertical' (ícone + texto empilhado) */
  layout?: 'horizontal' | 'vertical';
}

export function LogoFull({
  iconSize = 48,
  textColor,
  className,
  layout = 'horizontal',
}: LogoFullProps) {
  const fontSize = Math.round(iconSize * 0.42);
  const gap = Math.round(iconSize * 0.25);

  return layout === 'horizontal' ? (
    <div
      className={className}
      style={{ display: 'flex', alignItems: 'center', gap }}
    >
      <LogoMark size={iconSize} />
      <span
        style={{
          fontSize,
          fontWeight: 700,
          letterSpacing: '0.08em',
          color: textColor || 'currentColor',
          lineHeight: 1,
        }}
      >
        COTAOBRA
      </span>
    </div>
  ) : (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: Math.round(gap * 0.6),
      }}
    >
      <LogoMark size={iconSize} />
      <span
        style={{
          fontSize,
          fontWeight: 700,
          letterSpacing: '0.12em',
          color: textColor || 'currentColor',
          lineHeight: 1,
        }}
      >
        COTAOBRA
      </span>
    </div>
  );
}
