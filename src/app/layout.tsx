import type { Metadata } from "next";
import { Providers } from "./providers";
import { getThemeColors, buildThemeCssVars } from "@/lib/theme";
import { getPageStyleOverrides, buildPageStyleCssVars } from "@/lib/page-style-overrides";
import "./globals.css";
// Inter self-hospedada (pacote @fontsource-variable, não next/font/google) —
// pedido explícito: o build do Railway baixava a fonte de fonts.googleapis.com
// durante "next build" e falhava sempre que essa rede estava instável (ver
// falha real na 1ª tentativa de deploy da PR #192, log citado no pedido).
// Pacote vem no npm ci, zero chamada de rede durante o build. Mesma família
// (Inter), mesmo eixo de peso variável (100-900, igual ao default do
// next/font/google sem "weight" explícito) e display:swap já embutidos no
// CSS do pacote — ver node_modules/@fontsource-variable/inter/wght.css.
// --font-inter (consumida por tailwind.config.ts, fontFamily.sans) é
// declarada em globals.css (:root) como "Inter Variable", o nome de
// font-family que esse pacote usa — mesmo papel que inter.variable fazia
// antes, só que sem gerar a classe em runtime.
import "@fontsource-variable/inter/wght.css";
// Bricolage Grotesque/Figtree — fontes do guia "Bônus Full Face" (ver
// src/lib/bonus-fonts.ts), mesmo motivo acima. Pesos exatamente iguais aos
// que o next/font/google carregava (Bricolage 500/700, Figtree 400/500/600).
import "@fontsource/bricolage-grotesque/500.css";
import "@fontsource/bricolage-grotesque/700.css";
import "@fontsource/figtree/400.css";
import "@fontsource/figtree/500.css";
import "@fontsource/figtree/600.css";

export const metadata: Metadata = {
  title: "VEXO | M8 Growth",
  description: "Social selling automatizado para clínicas de saúde.",
};

// As cores do sistema (ver getThemeColors abaixo) vêm do banco e podem
// mudar a qualquer momento pela tela de Configurações — força toda página
// a renderizar por request (sem gerar HTML estático em build), senão uma
// página que fosse pré-gerada estaticamente (ex: /login) ficaria com as
// cores "congeladas" no valor de quando o projeto foi compilado.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Cores salvas pela tela de Configurações (ver src/lib/theme.ts) —
  // aplicadas como style inline no <html>, que sempre vence sobre as
  // variáveis padrão de globals.css (:root), então qualquer ajuste feito na
  // tela some pro sistema inteiro sem precisar mexer em CSS.
  const themeColors = await getThemeColors();
  const pageStyleOverrides = await getPageStyleOverrides();
  const themeVars = {
    ...buildThemeCssVars(themeColors),
    ...buildPageStyleCssVars(pageStyleOverrides),
  };

  return (
    <html lang="pt-BR" className="dark" style={themeVars as React.CSSProperties}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
