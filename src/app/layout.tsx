import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "VEXO | M8 Growth",
  description: "Social selling automatizado para clínicas de saúde.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
