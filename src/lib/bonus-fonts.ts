// Fontes SÓ do guia "Bônus Full Face" (ver FullFaceBonusGuide.module.css):
// expostas como variáveis CSS aplicadas no contêiner do guia — o resto do
// VEXO continua em Inter (src/app/layout.tsx).
//
// Self-hospedadas via @fontsource (não next/font/google) — pedido
// explícito: o build do Railway baixava essas fontes de
// fonts.googleapis.com durante "next build" e falhava sempre que essa rede
// estava instável (causa real de falhas intermitentes de deploy). Os
// arquivos @font-face de verdade são importados globalmente em
// src/app/layout.tsx (mesmos pesos de antes: Bricolage 500/700,
// Figtree 400/500/600); aqui só as classes que declaram as variáveis CSS
// (ver .bonus-font-title-var/.bonus-font-body-var em globals.css) — mesmo
// papel que bonusTitleFont.variable/bonusBodyFont.variable faziam antes,
// sem precisar de nenhuma chamada em runtime (next/font gerava essa classe
// dinamicamente; aqui ela já existe, estática, no CSS compilado).
export const bonusTitleFont = { variable: "bonus-font-title-var" };
export const bonusBodyFont = { variable: "bonus-font-body-var" };
