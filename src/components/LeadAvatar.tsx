"use client";

import { useState } from "react";
import { User } from "lucide-react";
import { InstagramGlyphIcon } from "@/components/BrandIcons";

const SIZE_CLASSES = { sm: "h-6 w-6", md: "h-8 w-8", lg: "h-10 w-10" } as const;
const ICON_SIZE_CLASSES = { sm: "h-3 w-3", md: "h-4 w-4", lg: "h-5 w-5" } as const;
// Badge do Instagram, sobreposto no canto inferior direito — proporcional
// ao tamanho do avatar (pequeno o bastante pra não tomar conta da foto,
// mas legível). Mesmo padrão visual usado por outros CRMs de social
// selling (Kommo, Clint) pra indicar o canal de origem do lead direto no
// avatar, sem precisar de um selo/texto separado.
const BADGE_SIZE_CLASSES = { sm: "h-2.5 w-2.5", md: "h-3 w-3", lg: "h-3.5 w-3.5" } as const;

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
//
// Badge do Instagram (InstagramGlyphIcon, ver BrandIcons.tsx — mesmo
// glifo usado na aba Conexões) sempre aparece, com foto real ou com o
// fallback de iniciais/ícone — hoje todo lead do VEXO vem do Instagram
// (único canal de leads do sistema), então não existe um caso em que o
// badge estaria "errado"; se um segundo canal de lead aparecer no futuro,
// isso vira um prop condicional.
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
  const badgeDimension = BADGE_SIZE_CLASSES[size];

  return (
    <div className={`relative shrink-0 ${dimension}`}>
      {profilePictureUrl && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={profilePictureUrl}
          alt={name ?? "Lead"}
          className={`${dimension} rounded-full border border-vexo-border object-cover`}
          onError={() => setFailed(true)}
        />
      ) : (
        <div
          className={`${dimension} flex items-center justify-center rounded-full border border-vexo-border bg-vexo-surface2`}
          aria-hidden="true"
        >
          <User className={`${ICON_SIZE_CLASSES[size]} text-vexo-muted`} strokeWidth={2} />
        </div>
      )}
      <InstagramGlyphIcon className={`${badgeDimension} absolute -bottom-0.5 -right-0.5 rounded-[35%] border border-vexo-bg`} />
    </div>
  );
}
