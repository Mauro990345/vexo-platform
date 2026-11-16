// Cópia pra área de transferência com fallback — navigator.clipboard.writeText
// pode falhar (sem permissão, contexto não-seguro, navegador antigo);
// document.execCommand("copy") via um textarea temporário é o método antigo
// que ainda funciona nesses casos. Usado por qualquer botão que copia uma
// mensagem sugerida antes de abrir o WhatsApp/Instagram (InstagramDmButton.tsx,
// FilaView.tsx — Fila de abordagem).
export async function copyToClipboard(text: string): Promise<boolean> {
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
