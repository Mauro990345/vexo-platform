"use client";

import { useState } from "react";

// Componente ÚNICO pro círculo de identidade da CLÍNICA (foto do Instagram
// da conta conectada, ou iniciais do nome quando não há foto) — pedido
// explícito: "um único componente, pra ficar igual em todas as telas".
// Levantamento no projeto inteiro (ver DESIGN.md) encontrou só UM lugar
// com esse círculo hoje (AccountChip, FilaView.tsx — Fila de abordagem);
// este componente substitui a implementação que estava solta ali, pronto
// pra qualquer tela nova que precisar do mesmo círculo reaproveitar.
//
// Mesmo padrão exato de LeadAvatar.tsx (<img> puro, nunca next/image — as
// URLs vêm de subdomínios do CDN do Instagram que mudam, não dá pra
// allowlistar um domínio fixo em next.config.js) e do mesmo motivo de
// "use client": o `onError` é a rede de segurança contra a foto ter
// expirado (ver InstagramAccount.profilePictureUrl/profilePictureFetchedAt,
// schema.prisma — a URL que a Graph API devolve é assinada/temporária,
// renovada por um job periódico, mas sempre existe uma janela onde a URL
// salva já pode ter expirado) — sem isso, viraria o ícone de imagem
// quebrada do navegador em vez de cair pras iniciais.
const SIZE_CLASSES = {
  // 48px — tamanho aprovado pra Fila de abordagem quando era 1 card por vez.
  lg: "h-12 w-12",
  // 36px — versão compacta pro layout de 3 cards simultâneos (rodada 6):
  // o círculo menor dentro do card deixa a tela caber inteira sem rolar no
  // celular; @ do lead e botão mantêm o tamanho aprovado (ver DESIGN.md).
  md: "h-9 w-9",
} as const;
const TEXT_SIZE_CLASSES = {
  lg: "text-base",
  md: "text-sm",
} as const;

export type ClinicAvatarSize = keyof typeof SIZE_CLASSES;

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

// Decisão pura (foto vs. iniciais) extraída à parte — testável sem
// precisar simular o evento `onError` de verdade num DOM (o ambiente de
// teste deste projeto roda só em Node, sem jsdom, ver vitest.config.ts).
export function resolveClinicAvatarMode(profilePictureUrl: string | null | undefined, failed: boolean): "photo" | "initials" {
  return profilePictureUrl && !failed ? "photo" : "initials";
}

export function ClinicAvatar({
  name,
  profilePictureUrl,
  size = "lg",
  // Classes de cor (fundo/texto) aplicadas SÓ no fallback de iniciais —
  // nunca na foto real, que já tem cor própria. Ver AccountChip (FilaView.tsx):
  // o círculo muda de cor conforme o estado da conta (verde/cinza/dourado/
  // cinza escuro) só quando mostra iniciais; uma foto de verdade não devia
  // ganhar um tingimento verde/dourado por cima.
  initialsClassName = "",
}: {
  name: string;
  profilePictureUrl?: string | null;
  size?: ClinicAvatarSize;
  initialsClassName?: string;
}) {
  const [failed, setFailed] = useState(false);
  const dimension = SIZE_CLASSES[size];

  if (resolveClinicAvatarMode(profilePictureUrl, failed) === "photo") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={profilePictureUrl!}
        alt={name}
        className={`${dimension} shrink-0 rounded-full border border-vexo-border object-cover`}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span
      className={`flex ${dimension} shrink-0 items-center justify-center rounded-full font-semibold ${TEXT_SIZE_CLASSES[size]} ${initialsClassName}`}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </span>
  );
}
