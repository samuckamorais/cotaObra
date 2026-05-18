/**
 * CotaObra Logo Components
 *
 * LogoMark  — apenas o ícone (usado em sidebar, mobile header, favicons)
 * LogoFull  — ícone + logotipo "COTAOBRA" (usado na tela de login)
 *
 * Cores extraídas do brand guide:
 *   Âmbar  #F0B429  — metade esquerda do anel + folha esquerda
 *   Verde  #4CAF50  — metade direita do anel + folha direita
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

      {/* ── Folha esquerda — âmbar ── */}
      <path
        d="M 50 67 C 45 56, 27 38, 27 24 C 32 26, 47 52, 50 65 Z"
        fill="#F0B429"
      />
      {/* ── Folha direita — verde ── */}
      <path
        d="M 50 67 C 55 56, 73 38, 73 24 C 68 26, 53 52, 50 65 Z"
        fill="#4CAF50"
      />

      {/* ── Caule central ── */}
      <rect x="48.5" y="64" width="3" height="13" rx="1.5" fill="#3CAF50" />

      {/* ── Folhinha inferior esquerda — âmbar ── */}
      <path
        d="M 47 71 C 41 67, 35 61, 33 55 C 38 57, 45 65, 47 71 Z"
        fill="#F0B429"
      />
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
