"use client";

import { useId } from "react";

// Os dois glifos abaixo são autocontidos: já incluem o próprio fundo
// (squircle + gradiente da marca) dentro do SVG. Por isso, em todo lugar
// que os usa, o ícone deve preencher o container inteiro (ex.: h-7 w-7
// dentro de um wrapper h-7 w-7) e o wrapper NÃO deve ter iconBg/bg-* — um
// fundo do Tailwind atrás do SVG ficaria como uma segunda camada de cor
// atrás do squircle já desenhado, sem nenhum propósito.
//
// Proporções calibradas pra bater com os logos oficiais (não são os SVGs
// oficiais pixel-a-pixel da Meta/WhatsApp Inc., mas reproduzem desenho,
// cores E proporção real) — ajuste feito depois de um primeiro rascunho
// com os elementos internos pequenos/centralizados demais: nos logos reais,
// o elemento interno (círculo do WhatsApp, quadrado da câmera do
// Instagram) é GRANDE, quase tocando as bordas do squircle, não um ícone
// pequeno com bastante margem ao redor.

// Glifo do Instagram: squircle com gradiente diagonal (amarelo → laranja →
// rosa → roxo, canto inferior-esquerdo pro superior-direito), quadrado
// branco vazado GRANDE (~73% da largura do ícone) representando o corpo da
// câmera, círculo branco vazado centralizado dentro dele (a lente), e um
// pontinho branco preenchido no canto superior direito (o flash/câmera
// frontal). useId() em vez de um id fixo pro gradiente: o mesmo componente
// aparece várias vezes na mesma página (um badge por card do Pipeline/
// Painel, por exemplo) — um id fixo duplicaria no DOM (HTML exige id único
// por documento; sem isso, todas as instâncias menos a primeira perderiam
// o gradiente em alguns navegadores).
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
      <rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5" fill="none" stroke="white" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="4.6" fill="none" stroke="white" strokeWidth="1.8" />
      <circle cx="16.3" cy="7.7" r="1.15" fill="white" />
    </svg>
  );
}

// Glifo do WhatsApp: squircle com gradiente verde (mais claro em cima, mais
// escuro embaixo), círculo branco vazado GRANDE (quase tocando as bordas)
// com um "rabinho" de balão de conversa saindo do canto inferior esquerdo
// (desenhado como parte do mesmo contorno, não um elemento separado), e um
// fone de telefone branco preenchido centralizado dentro do círculo.
export function WhatsAppGlyphIcon({ className }: { className?: string }) {
  const gradientId = useId();
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#5BD066" />
          <stop offset="100%" stopColor="#27B43E" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="24" height="24" rx="6" fill={`url(#${gradientId})`} />
      <path
        d="M12 3.6a8.4 8.4 0 0 0-7.15 12.8L3.6 20.4l4.15-1.2A8.4 8.4 0 1 0 12 3.6Z"
        fill="none"
        stroke="white"
        strokeWidth="1.7"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M9.1 7.9c-.22-.5-.38-.5-.58-.5-.15 0-.32 0-.5.02-.17.02-.45.08-.68.36-.24.28-.9.9-.9 2.2 0 1.3.93 2.56 1.06 2.74.13.18 1.84 2.94 4.53 4.03 2.24.9 2.7.72 3.19.68.5-.04 1.6-.65 1.83-1.29.22-.63.22-1.17.15-1.29-.06-.11-.24-.18-.5-.32-.27-.13-1.58-.78-1.82-.87-.25-.09-.43-.14-.61.13-.18.27-.7.87-.85 1.05-.16.18-.32.2-.59.07-.27-.13-1.13-.42-2.16-1.33-.8-.71-1.34-1.6-1.5-1.87-.15-.27-.01-.42.12-.55.12-.12.27-.32.4-.48.13-.16.18-.27.26-.45.09-.18.04-.35-.02-.48-.07-.14-.6-1.5-.83-2.06Z"
        fill="white"
      />
    </svg>
  );
}
