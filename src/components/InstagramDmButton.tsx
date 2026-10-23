"use client";

import { useState } from "react";
import { InstagramGlyphIcon } from "@/components/BrandIcons";

// Fallback de clipboard: navigator.clipboard.writeText pode falhar (sem
// permissão, contexto não-seguro, navegador antigo) — document.execCommand
// ("copy") via um textarea temporário é o método antigo que ainda funciona
// nesses casos.
async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // cai pro fallback abaixo
    }
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

// Botão "Instagram" da faixa de Reativação (ver ReactivationRail.tsx) — um
// clique só faz DUAS coisas: copia a mensagem sugerida pra área de
// transferência (pra secretária colar no Direct — a Meta não expõe nenhum
// parâmetro de texto pro ig.me, diferente do wa.me) e abre a conversa no
// Instagram (ig.me/m/<@>) numa aba nova. O envio nunca é automático — só
// copia e abre, quem cola e aperta "Enviar" lá dentro é sempre a
// secretária, igual ao botão de WhatsApp (que também só abre o wa.me já
// preenchido). Sem @ do lead, dmLink vem null (ver resolveInstagramDmLink,
// reactivation.ts) e o botão fica desativado.
export function InstagramDmButton({ message, dmLink }: { message: string; dmLink: string | null }) {
  const [toast, setToast] = useState<string | null>(null);

  async function handleClick() {
    const copied = await copyToClipboard(message);
    setToast(copied ? "Mensagem copiada" : "Não foi possível copiar");
    window.setTimeout(() => setToast(null), 2500);
    if (dmLink) window.open(dmLink, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={handleClick}
        disabled={!dmLink}
        className="inline-flex items-center gap-1 rounded-lg border border-pink-400/40 bg-gradient-to-r from-pink-500/10 to-purple-500/10 px-2 py-1 text-caption font-semibold text-pink-300 transition hover:border-pink-400/60 hover:from-pink-500/20 hover:to-purple-500/20 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:from-pink-500/10 disabled:hover:to-purple-500/10"
      >
        <InstagramGlyphIcon className="h-3 w-3" />
        Instagram
      </button>
      {toast && (
        <span className="absolute -top-7 right-0 whitespace-nowrap rounded-md bg-vexo-surface2 px-2 py-1 text-caption text-vexo-fg shadow-card">
          {toast}
        </span>
      )}
    </div>
  );
}
