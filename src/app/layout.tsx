import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "./providers";
import { getThemeColors, buildThemeCssVars } from "@/lib/theme";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

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
  const themeVars = buildThemeCssVars(await getThemeColors());

  return (
    <html lang="pt-BR" className={`dark ${inter.variable}`} style={themeVars as React.CSSProperties}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
