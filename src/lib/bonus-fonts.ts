import { Bricolage_Grotesque, Figtree } from "next/font/google";

// Fontes SÓ do guia "Bônus Full Face" (ver FullFaceBonusGuide.module.css):
// expostas como variáveis CSS aplicadas no contêiner do guia — o resto do
// VEXO continua em Inter (src/app/layout.tsx).
export const bonusTitleFont = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--bonus-font-title",
  display: "swap",
});

export const bonusBodyFont = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--bonus-font-body",
  display: "swap",
});
