"use client";

import { useState } from "react";

// Campo de cor "por página" — igual ao ColorField (cor + descrição + hex
// visível), só que com um toggle extra "Personalizar só nesta página" na
// frente. Desligado (padrão): mostra a cor que está em vigor AGORA (a
// global que esse campo segue), mas o seletor fica desabilitado — mexer
// nele não faz nada até ligar o toggle. Ligado: o seletor destrava e passa
// a guardar um valor PRÓPRIO, independente do resto do sistema.
//
// followsLabel aparece na descrição só quando desligado, pra deixar claro
// qual cor global esse campo está seguindo enquanto ninguém personaliza.
export function PageStyleColorField({
  name,
  label,
  description,
  followsLabel,
  currentColor,
  initiallyOverridden,
}: {
  name: string;
  label: string;
  description: string;
  followsLabel: string;
  currentColor: string;
  initiallyOverridden: boolean;
}) {
  const [enabled, setEnabled] = useState(initiallyOverridden);
  const [color, setColor] = useState(currentColor);

  return (
    <div className="space-y-2 rounded-lg border border-vexo-border bg-vexo-surface2 p-2.5">
      <div className="flex items-start gap-3">
        <input
          type="color"
          name={`${name}.value`}
          value={color}
          disabled={!enabled}
          onChange={(e) => setColor(e.target.value)}
          className="h-9 w-9 shrink-0 cursor-pointer rounded border border-vexo-border bg-transparent p-0.5 disabled:cursor-not-allowed disabled:opacity-40"
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium">{label}</p>
          <p className="mt-0.5 text-card text-vexo-muted">{description}</p>
          <p className="mt-0.5 font-mono text-caption uppercase text-vexo-muted">
            {color} {!enabled && <span>· seguindo "{followsLabel}"</span>}
          </p>
        </div>
      </div>

      <label className="flex items-center gap-1.5 border-t border-vexo-border pt-2 text-caption text-vexo-muted">
        <input
          type="checkbox"
          name={`${name}.enabled`}
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-3 w-3 cursor-pointer accent-vexo-accent"
        />
        Personalizar só nesta página
      </label>
    </div>
  );
}
