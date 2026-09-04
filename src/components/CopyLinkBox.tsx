"use client";

import { useState } from "react";

export function CopyLinkBox({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard indisponível — o campo readOnly abaixo ainda deixa
      // selecionar e copiar manualmente.
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-vexo-accent/40 bg-vexo-accent/10 px-2.5 py-1.5">
      <input
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="min-w-0 flex-1 truncate bg-transparent text-xs text-vexo-fg outline-none"
      />
      <button
        type="button"
        onClick={handleCopy}
        className="shrink-0 rounded-md border border-vexo-accent px-2 py-1 text-caption font-medium text-vexo-accent hover:bg-vexo-accent/10"
      >
        {copied ? "Copiado!" : "Copiar"}
      </button>
    </div>
  );
}
