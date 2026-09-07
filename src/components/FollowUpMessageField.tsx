"use client";

import { useRef, useState } from "react";

const NAME_VARIABLE = "{{primeiro_nome}}";

// Textarea do texto das mensagens de follow-up, com um botão que insere
// {{primeiro_nome}} na posição do cursor (padrão de plataformas tipo
// GHL/Mailchimp) em vez de exigir copiar/colar a variável manualmente.
// Controlado (useState) só por causa disso — o valor ainda sai no
// FormData do form ao redor normalmente, via name="content".
export function FollowUpMessageField({
  defaultValue = "",
  placeholder,
}: {
  defaultValue?: string;
  placeholder?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function insertVariable() {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart ?? value.length;
    const end = textarea.selectionEnd ?? value.length;
    const next = value.slice(0, start) + NAME_VARIABLE + value.slice(end);
    setValue(next);

    // Reposiciona o cursor logo depois da variável inserida — sem isso, o
    // foco voltaria pro fim do texto depois do re-render.
    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + NAME_VARIABLE.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="block text-xs text-vexo-muted">Texto da mensagem</label>
        <button
          type="button"
          onClick={insertVariable}
          className="rounded-md border border-vexo-border px-1.5 py-0.5 text-card text-vexo-accent hover:border-vexo-accent"
        >
          + Nome do lead
        </button>
      </div>
      <textarea
        ref={textareaRef}
        name="content"
        rows={3}
        required
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
      />
    </div>
  );
}
