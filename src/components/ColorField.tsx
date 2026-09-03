"use client";

import { useState } from "react";

// Campo de cor com descrição em português simples embaixo e o código hex
// atual sempre visível (o usuário não precisa clicar no seletor pra saber o
// valor). Controlado localmente só pra manter o texto do hex em sincronia
// com o seletor — quem guarda o valor de verdade é o form (Server Action),
// via o próprio <input type="color"> (que já submete "#rrggbb").
export function ColorField({
  name,
  defaultValue,
  label,
  description,
}: {
  name: string;
  defaultValue: string;
  label: string;
  description: string;
}) {
  const [value, setValue] = useState(defaultValue);

  return (
    <div className="flex items-start gap-3 rounded-lg border border-vexo-border bg-vexo-surface2 p-2.5">
      <input
        type="color"
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-9 w-9 shrink-0 cursor-pointer rounded border border-vexo-border bg-transparent p-0.5"
      />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium">{label}</p>
        <p className="mt-0.5 text-card text-vexo-muted">{description}</p>
        <p className="mt-0.5 font-mono text-caption uppercase text-vexo-muted">{value}</p>
      </div>
    </div>
  );
}
