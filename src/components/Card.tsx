import type { HTMLAttributes, FormHTMLAttributes, ReactNode } from "react";

// Componente base novo (Etapa 2 da migração de design, ver DESIGN.md) —
// ainda não usado por nenhuma tela. Reproduz o bloco/card já usado hoje
// em dezenas de telas (ex: cada seção de Automações) — borda fina +
// fundo + cantos arredondados, com os tokens da Etapa 1 (rounded-block,
// p-block = mesmos valores de rounded-xl/p-3.5, nenhum bloco existente
// muda de tamanho). `as="form"` cobre o caso comum de um bloco que É um
// <form> (a maioria dos blocos de Automações), sem precisar de uma <div>
// extra por dentro.
const SURFACE_CLASSES = {
  surface: "bg-vexo-surface",
  surface2: "bg-vexo-surface2",
} as const;

type CardSurface = keyof typeof SURFACE_CLASSES;

type CardProps = {
  surface?: CardSurface;
  className?: string;
  children: ReactNode;
} & (({ as?: "div" } & HTMLAttributes<HTMLDivElement>) | ({ as: "form" } & FormHTMLAttributes<HTMLFormElement>));

export function Card({ surface = "surface", className = "", children, as, ...rest }: CardProps) {
  const classes = `rounded-block border border-vexo-border ${SURFACE_CLASSES[surface]} p-block ${className}`;

  if (as === "form") {
    return (
      <form className={classes} {...(rest as FormHTMLAttributes<HTMLFormElement>)}>
        {children}
      </form>
    );
  }

  return (
    <div className={classes} {...(rest as HTMLAttributes<HTMLDivElement>)}>
      {children}
    </div>
  );
}
