# Clean Minimal Utility Design System

Sistema de design implementado seguindo os princípios de Linear, Vercel, Raycast e Notion.

## Princípios Fundamentais

### 1. Paleta de Cores
- **Fundo neutro**: Branco puro (#FFFFFF) no light mode, cinza escuro (#121212) no dark mode
- **Accent Color**: Indigo #4F6EF7 (hsl(227 92% 64%))
- **Sem gradientes**: Cores sólidas apenas
- **Contraste**: Profundidade criada pelo contraste entre sidebar e conteúdo, não por sombras

### 2. Tipografia
- **Tamanhos pequenos**: 
  - UI: 11-14px
  - Métricas: 22px
  - Títulos: máximo 28px
- **Pesos limitados**: Apenas 400 (normal) e 500 (medium)
- **Nunca usar**: 600 ou 700 (muito pesados para este estilo)

### 3. Bordas
- **0.5px ou 1px solid**: Sempre em cinza muito suave
- **Sem sombras**: Profundidade criada por contraste de fundo
- **Border radius**: 6px (md) para cards, botões e inputs

### 4. Status e Badges
- **Pills coloridas**: Com fundo levíssimo da mesma cor
  - Verde: Ativo/Sucesso
  - Âmbar: Alerta/Trial
  - Vermelho: Erro/Cancelado
  - Azul (Indigo): Info/Default

## Componentes Implementados

### Card
```tsx
- Padding: 16px (p-4)
- Border: 0.5px solid border
- Border radius: 6px
- Background: var(--card)
- Header padding-bottom: 12px (pb-3)
```

### Button
```tsx
- Heights: sm(32px), default(36px), lg(40px), icon(36x36)
- Border: 0.5px
- Font: text-sm, font-normal
- Variants: default, outline, ghost, secondary, destructive
```

### Badge
```tsx
- Padding: px-1.5 py-0.5
- Border: 0.5px
- Border radius: 6px (md)
- Font: text-xs, font-normal
- Variants com backgrounds sutis
```

### Input
```tsx
- Padding: px-3 py-2
- Border: 0.5px solid border
- Font: text-sm
- Focus: ring-2 ring-primary
```

## Layout

### Sidebar
- Largura: 224px (w-56)
- Background: var(--sidebar) - cinza muito sutil
- Border right: 0.5px
- Navegação: Items com hover bg-secondary, active com bg-secondary

### Header
- Altura: 56px (h-14)
- Border bottom: 0.5px
- Padding horizontal: 24px (px-6)
- Background: var(--background)

### Conteúdo Principal
- Background: var(--background)
- Espaçamento generoso entre seções
- Cards com gap de 12px (gap-3)

## Variáveis CSS

### Light Mode
```css
--background: 0 0% 100%          /* Branco puro */
--foreground: 0 0% 9%            /* Preto suave */
--primary: 227 92% 64%           /* Indigo */
--border: 0 0% 90%               /* Cinza muito suave */
--sidebar: 0 0% 98%              /* Cinza quase branco */
```

### Dark Mode
```css
--background: 0 0% 7%            /* Preto suave */
--foreground: 0 0% 98%           /* Branco suave */
--primary: 227 92% 68%           /* Indigo mais claro */
--border: 0 0% 18%               /* Cinza escuro */
--sidebar: 0 0% 4%               /* Preto mais escuro */
```

## Referências

Ferramentas que seguem este padrão:
- [Linear.app](https://linear.app) - Design de referência principal
- [Vercel Dashboard](https://vercel.com/dashboard)
- [Raycast](https://raycast.com)
- [Cal.com](https://cal.com)
- [Trigger.dev](https://trigger.dev)

## Anti-Padrões (Evitar)

❌ Gradientes chamativos
❌ Glassmorphism exagerado
❌ Animações pesadas
❌ Sombras múltiplas ou pesadas
❌ Font weights 600/700
❌ Bordas grossas (>1px)
❌ Cores vibrantes demais
❌ Elementos tridimensionais

## Padrões Corretos (Usar)

✅ Superfícies neutras planas
✅ Tipografia bem hierarquizada
✅ Ícones simples e pequenos (3.5-4px)
✅ Bordas sutis de 0.5px
✅ Espaçamento generoso
✅ Único accent color (indigo)
✅ Densidade informacional equilibrada
✅ Foco total na funcionalidade
