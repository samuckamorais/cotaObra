/**
 * CotaObra Logo Components
 *
 * LogoMark  — apenas o ícone (usado em sidebar, mobile header, favicons)
 * LogoFull  — ícone + logotipo "COTAOBRA" (usado na tela de login)
 *
 * Brand: monocromática. Usa `currentColor` → herda a cor do texto do contexto:
 *   - fundo claro (texto escuro)  → logo preta
 *   - fundo escuro (texto claro)  → logo clara
 * Para forçar uma cor específica, passe via `style={{ color: '#...' }}` ou
 * `className="text-white"` no LogoMark/wrapper.
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
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="CotaObra"
    >
      {/* Anel (duas metades) */}
      <path d="M 50 7 A 43 43 0 0 0 50 93 L 50 75 A 25 25 0 0 1 50 25 Z" />
      <path d="M 50 7 A 43 43 0 0 1 50 93 L 50 75 A 25 25 0 0 0 50 25 Z" />

      {/* Skyline: 3 prédios estilizados */}
      <rect x="31" y="48" width="13" height="29" rx="1" />
      <rect x="45" y="35" width="14" height="42" rx="1" />
      <rect x="60" y="54" width="11" height="23" rx="1" />

      {/* Antena/guincho do prédio central */}
      <rect x="51" y="29" width="2" height="7" />
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
