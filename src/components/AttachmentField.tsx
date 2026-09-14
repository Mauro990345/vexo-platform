"use client";

import { useRef, useState } from "react";

// input[type=file] é sempre não-controlado — o navegador nunca deixa
// setar seu .value via React, só limpar via ref. Sem isso, dois problemas
// reais relatados no Follow-up: (1) depois de escolher um arquivo e
// mudar de ideia, não tinha nenhum jeito visível de voltar pra "nenhum
// arquivo" sem recarregar a página inteira; (2) depois de adicionar/salvar
// um passo com sucesso, o arquivo escolhido continuava "preso" no campo
// mesmo com o resto do formulário limpo — porque o <input> não é
// remontado automaticamente só por causa de outros campos ao redor
// resetarem. Resolve os dois: mostra o nome do arquivo escolhido com um
// botão "Remover" que limpa o input na hora (via ref), e o CHAMADOR passa
// um `key` que muda quando o dado salvo muda (ex: quantidade de passos,
// ou a URL do anexo já salvo) — isso força o React a remontar este
// componente do zero (input limpo) depois de um submit bem-sucedido.
export function AttachmentField({
  name = "attachmentFile",
  helpText,
}: {
  name?: string;
  helpText?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <div>
      <input
        ref={inputRef}
        name={name}
        type="file"
        accept="image/*,video/*"
        onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
        className="block w-full text-xs text-vexo-muted file:mr-2 file:rounded-lg file:border file:border-vexo-border file:bg-vexo-bg file:px-2.5 file:py-1.5 file:text-xs file:text-vexo-fg hover:file:border-vexo-accent"
      />
      {fileName && (
        <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-card">
          <span className="min-w-0 flex-1 truncate text-vexo-fg">{fileName}</span>
          <button
            type="button"
            onClick={() => {
              if (inputRef.current) inputRef.current.value = "";
              setFileName(null);
            }}
            className="shrink-0 text-vexo-error hover:underline"
          >
            Remover
          </button>
        </div>
      )}
      {helpText && <p className="mt-1 text-card text-vexo-muted">{helpText}</p>}
    </div>
  );
}
