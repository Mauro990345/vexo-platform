"use client";

import { useState } from "react";
import { InstagramMonoIcon } from "@/components/BrandIcons";
import { REACTIVATION_ACTION_BUTTON_CLASS, INSTAGRAM_ACTION_GRADIENT } from "@/components/ReactivationActionButtonStyle";

const LABEL_RESET_DELAY_MS = 2000;
const TOAST_DURATION_MS = 2500;

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
//
// Dois avisos do mesmo clique, de propósito: o toast flutuante (mensagem
// completa, "Mensagem copiada"/"Não foi possível copiar") E o próprio
// rótulo do botão virando "Copiado ✓" por 2s (pedido explícito) — o toast
// pode passar batido se o olho já saiu da linha depois de abrir a aba nova
// do Instagram; o rótulo do botão fica ali, no lugar que o olho já estava.
export function InstagramDmButton({ message, dmLink }: { message: string; dmLink: string | null }) {
  const [toast, setToast] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    const ok = await copyToClipboard(message);
    setToast(ok ? "Mensagem copiada" : "Não foi possível copiar");
    window.setTimeout(() => setToast(null), TOAST_DURATION_MS);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), LABEL_RESET_DELAY_MS);
    }
    if (dmLink) window.open(dmLink, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={handleClick}
        disabled={!dmLink}
        style={{ background: INSTAGRAM_ACTION_GRADIENT }}
        className={REACTIVATION_ACTION_BUTTON_CLASS}
      >
        <InstagramMonoIcon className="h-3 w-3" />
        {copied ? "Copiado ✓" : "Instagram"}
      </button>
      {toast && (
        <span className="absolute -top-7 right-0 whitespace-nowrap rounded-md bg-vexo-surface2 px-2 py-1 text-caption text-vexo-fg shadow-card">
          {toast}
        </span>
      )}
    </div>
  );
}
