"use client";

import { useState } from "react";

// Textarea do prompt de conversação com contador de caracteres ao vivo —
// só por isso é client component; quem lê o valor de verdade no submit
// continua sendo o form (Server Action) via o próprio name="aiSystemPrompt".
export function PromptTextarea({ id, name, defaultValue, placeholder }: {
  id: string;
  name: string;
  defaultValue: string;
  placeholder: string;
}) {
  const [value, setValue] = useState(defaultValue);

  return (
    <div>
      <textarea
        id={id}
        name={name}
        rows={10}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border-2 border-vexo-accent/40 bg-vexo-bg px-3 py-2 font-mono text-card outline-none focus:border-vexo-accent"
      />
      <p className="mt-1 text-right text-caption text-vexo-muted">{value.length.toLocaleString("pt-BR")} caracteres</p>
    </div>
  );
}
