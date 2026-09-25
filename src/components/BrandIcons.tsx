"use client";

import { useId } from "react";

// Glifo simplificado da câmera do Instagram (quadrado arredondado + lente +
// "flash") com o gradiente de marca (amarelo → laranja → rosa → roxo) — não
// é o SVG oficial pixel-a-pixel da Meta, mas reproduz o desenho e as cores
// reais o bastante pra ser reconhecível em qualquer tamanho: do badge
// pequeno sobreposto no avatar (LeadAvatar.tsx) ao ícone maior da aba
// Conexões. useId() em vez de um id fixo pro gradiente: o mesmo componente
// aparece várias vezes na mesma página (um badge por card do Pipeline/
// Painel) — um id fixo duplicaria no DOM (HTML exige id único por
// documento; sem isso, todas as instâncias menos a primeira perderiam o
// gradiente em alguns navegadores).
export function InstagramGlyphIcon({ className }: { className?: string }) {
  const gradientId = useId();
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FED576" />
          <stop offset="26%" stopColor="#F47133" />
          <stop offset="61%" stopColor="#BC3081" />
          <stop offset="100%" stopColor="#4F5BD5" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="24" height="24" rx="6" fill={`url(#${gradientId})`} />
      <rect x="6.5" y="6.5" width="11" height="11" rx="3.5" fill="none" stroke="white" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="3.2" fill="none" stroke="white" strokeWidth="1.6" />
      <circle cx="16.2" cy="7.8" r="1" fill="white" />
    </svg>
  );
}

// Silhueta do fone-no-balão do WhatsApp, em currentColor (branco quando
// usada dentro do quadrado verde de ConnectionCard, iconBg="bg-emerald-500")
// — substitui o MessageCircle genérico (balão de chat qualquer) que estava
// lá antes, sem identidade visual nenhuma da marca.
export function WhatsAppGlyphIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.472-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347Z" />
      <path d="M12.001 2C6.478 2 2 6.477 2 12c0 1.886.523 3.652 1.432 5.159L2 22l4.995-1.409A9.955 9.955 0 0 0 12.001 22C17.523 22 22 17.523 22 12S17.523 2 12.001 2Zm0 18.166a8.14 8.14 0 0 1-4.152-1.14l-.298-.177-3.093.873.826-3.02-.195-.31a8.14 8.14 0 0 1-1.253-4.392c0-4.501 3.664-8.166 8.167-8.166 4.502 0 8.166 3.665 8.166 8.166 0 4.502-3.664 8.166-8.168 8.166Z" />
    </svg>
  );
}
