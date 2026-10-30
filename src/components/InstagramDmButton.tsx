"use client";

import { useState } from "react";
import { InstagramMonoIcon } from "@/components/BrandIcons";
import { INSTAGRAM_ACTION_BUTTON_CLASS, INSTAGRAM_ACTION_GRADIENT } from "@/components/ReactivationActionButtonStyle";
import { MOBILE_ICON_SIZE } from "@/components/MobileCardScale";

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
// clique faz DUAS coisas: copia a mensagem sugerida pra área de
// transferência E abre a conversa no Instagram (ig.me/m/<@>) numa aba
// nova. `dmLink` já chega pronto de resolveInstagramDmLink/buildInstagramDmLink
// (reactivation.ts) com ?text=<mensagem> tentando pré-preencher o campo —
// parâmetro NÃO documentado pela Meta (ao contrário do wa.me), então
// algumas versões do app/webview podem ignorá-lo (ou a URL ter ficado
// grande demais e vir sem o parâmetro, ver INSTAGRAM_DM_LINK_MAX_LENGTH) —
// por isso a cópia pra área de transferência acontece SEMPRE, no mesmo
// clique, nunca só a abertura do link: se o campo não vier preenchido, a
// secretária só cola. O envio nunca é automático — quem aperta "Enviar"
// lá dentro é sempre a secretária, igual ao botão de WhatsApp (que também
// só abre o wa.me já preenchido). Sem @ do lead, dmLink vem null (ver
// resolveInstagramDmLink, reactivation.ts) e o botão fica desativado.
//
// Dois avisos do mesmo clique, de propósito: o toast flutuante (mensagem
// completa, "Mensagem copiada"/"Não foi possível copiar") E o próprio
// rótulo do botão virando "Copiado ✓" por 2s (pedido explícito) — o toast
// pode passar batido se o olho já saiu da linha depois de abrir a aba nova
// do Instagram; o rótulo do botão fica ali, no lugar que o olho já estava.
export function InstagramDmButton({
  message,
  dmLink,
  onSent,
}: {
  message: string;
  dmLink: string | null;
  // Marca o card como enviado na Reativação (ver ReactivationRail) — chamada
  // SÍNCRONA, antes de qualquer await abaixo (inclusive antes do
  // window.open), pra registrar o clique mesmo que o navegador bloqueie a
  // abertura da nova aba (pedido explícito) — nunca depende do resultado de
  // window.open nem do copyToClipboard.
  onSent?: () => void;
}) {
  const [toast, setToast] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    onSent?.();
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
    <div className={`group relative shrink-0 ${dmLink ? "" : "opacity-40"}`}>
      {/* Borda em degradê: CSS não tem isso direto — wrapper com 1px de
          padding preenchido pelo degradê + "miolo" com a cor de fundo do
          card por dentro (bg-vexo-surface, a mesma da linha da lista) —
          sobra só 1px visível do degradê, como uma borda. */}
      <div className="rounded-lg p-px" style={{ background: INSTAGRAM_ACTION_GRADIENT }}>
        <div className="relative overflow-hidden rounded-[7px] bg-vexo-surface">
          {/* Tingimento do hover: o mesmo degradê a 10% de opacidade,
              numa camada própria (não dá pra fazer hover:bg com um
              gradiente via inline style) — group-hover porque o elemento
              hover-ável de verdade é o <button>, não esta camada. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-150 group-hover:opacity-10"
            style={{ background: INSTAGRAM_ACTION_GRADIENT }}
          />
          <button type="button" onClick={handleClick} disabled={!dmLink} className={INSTAGRAM_ACTION_BUTTON_CLASS}>
            {/* SÓ CELULAR (ver MobileCardScale.ts): 12px -> 17px. */}
            <InstagramMonoIcon className={MOBILE_ICON_SIZE} />
            {copied ? "Copiado ✓" : "Instagram"}
          </button>
        </div>
      </div>
      {toast && (
        <span className="absolute -top-7 right-0 whitespace-nowrap rounded-md bg-vexo-surface2 px-2 py-1 text-caption text-vexo-fg shadow-card">
          {toast}
        </span>
      )}
    </div>
  );
}
