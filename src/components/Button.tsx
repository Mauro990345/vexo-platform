import type { ButtonHTMLAttributes } from "react";

// Componente base novo (Etapa 2 da migração de design, ver DESIGN.md e
// docs/design-audit.md) — ainda não usado por nenhuma tela. Reproduz os
// botões já usados hoje em quase toda tela (ex: "Salvar configuração" em
// Automações/Agente de IA), só com nome/variantes formais em vez de cada
// tela redigitar a mesma string de classe. Usa os tokens da Etapa 1
// (rounded-control, control-x/control-y) — mesmos valores em px de
// rounded-lg/px-2.5/py-1.5, nenhum botão existente muda de tamanho.
export type ButtonVariant = "primary" | "outline" | "ghost";
export type ButtonSize = "sm" | "md";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  // Preenchido — ação principal de uma tela (ex: "Registrar" em Automações).
  primary: "bg-vexo-accent text-vexo-accentFg hover:opacity-90",
  // Contorno — ação de salvar dentro de um bloco, a mais comum hoje.
  outline: "border border-vexo-accent text-vexo-accent hover:bg-vexo-accent/10",
  // Discreto — ação secundária/pouco destacada (ex: "Salvar legenda" num
  // card de foto), borda neutra até o hover.
  ghost: "border border-vexo-border text-vexo-muted hover:border-vexo-accent hover:text-vexo-accent",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: "px-control-x py-control-y text-xs",
  sm: "px-1.5 py-0.5 text-card",
};

export function Button({
  variant = "outline",
  size = "md",
  className = "",
  type = "button",
  ...props
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={`rounded-control font-medium transition disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...props}
    />
  );
}
