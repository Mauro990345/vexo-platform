"use client";

import { useState } from "react";
import { User } from "lucide-react";

const SIZE_CLASSES = { sm: "h-6 w-6", md: "h-8 w-8", lg: "h-10 w-10" } as const;
const ICON_SIZE_CLASSES = { sm: "h-3 w-3", md: "h-4 w-4", lg: "h-5 w-5" } as const;

// Avatar do lead (Painel e Pipeline) — <img> puro, não next/image: as URLs
// vêm do CDN do Instagram, em subdomínios que mudam (scontent-*), então não
// dá pra allowlistar um domínio fixo em next.config.js (mesmo padrão já
// usado no projeto pra outras imagens externas, ver
// WhatsappConnectionPanel.tsx/agente-ia/page.tsx).
//
// "use client" só por causa do onError abaixo — é a rede de segurança
// contra o caso real documentado em Lead.profilePictureFetchedAt
// (schema.prisma): a URL que a Graph API devolve é tipicamente
// assinada/temporária, então mesmo com o refresh periódico do worker
// (lead-profile-picture-backfill.ts) sempre existe uma janela onde a URL
// salva pode já ter expirado quando alguém abre a página. Sem isso, uma URL
// morta vira o ícone de imagem quebrada do navegador em vez do placeholder
// — pior visualmente que simplesmente não ter foto nenhuma.
export function LeadAvatar({
  profilePictureUrl,
  name,
  size = "sm",
}: {
  profilePictureUrl?: string | null;
  name?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const [failed, setFailed] = useState(false);
  const dimension = SIZE_CLASSES[size];

  if (profilePictureUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={profilePictureUrl}
        alt={name ?? "Lead"}
        className={`${dimension} shrink-0 rounded-full border border-vexo-border object-cover`}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      className={`${dimension} flex shrink-0 items-center justify-center rounded-full border border-vexo-border bg-vexo-surface2`}
      aria-hidden="true"
    >
      <User className={`${ICON_SIZE_CLASSES[size]} text-vexo-muted`} strokeWidth={2} />
    </div>
  );
}
