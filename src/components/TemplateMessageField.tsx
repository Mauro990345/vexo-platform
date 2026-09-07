"use client";

import { useRef, useState } from "react";

type Variable = { token: string; label: string };

const DEFAULT_VARIABLES: Variable[] = [{ token: "{{primeiro_nome}}", label: "+ Nome do lead" }];

// Textarea de texto de mensagem com botões que inserem variáveis (ex:
// {{primeiro_nome}}) na posição do cursor (padrão de plataformas tipo
// GHL/Mailchimp) em vez de exigir copiar/colar manualmente. Reaproveitado
// pelos passos de follow-up (uma variável) e pelos lembretes de agendamento
// (duas: nome do lead e horário) — controlado (useState) só por causa da
// inserção; o valor ainda sai no FormData do form ao redor normalmente.
export function TemplateMessageField({
  name = "content",
  label = "Texto da mensagem",
  defaultValue = "",
  placeholder,
  required = true,
  rows = 3,
  variables = DEFAULT_VARIABLES,
}: {
  name?: string;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  rows?: number;
  variables?: Variable[];
}) {
  const [value, setValue] = useState(defaultValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function insertVariable(token: string) {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart ?? value.length;
    const end = textarea.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    setValue(next);

    // Reposiciona o cursor logo depois da variável inserida — sem isso, o
    // foco voltaria pro fim do texto depois do re-render.
    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + token.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <label className="block text-xs text-vexo-muted">{label}</label>
        <div className="flex flex-wrap gap-1">
          {variables.map((v) => (
            <button
              key={v.token}
              type="button"
              onClick={() => insertVariable(v.token)}
              className="rounded-md border border-vexo-border px-1.5 py-0.5 text-card text-vexo-accent hover:border-vexo-accent"
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
      <textarea
        ref={textareaRef}
        name={name}
        rows={rows}
        required={required}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
      />
    </div>
  );
}
