import type { Metadata } from "next";
import { TermsContent } from "@/components/public/TermsContent";

// Rota antiga dos termos — mesmo conteúdo de /termos (sem redirecionar, pra
// quem já tem este link cadastrado, ex.: configuração do app na Meta,
// receber a página diretamente). Canonical aponta pra /termos.
export const metadata: Metadata = {
  title: "Termos de uso | VEXO IA",
  alternates: { canonical: "/termos" },
};

export default function LegacyTermsPage() {
  return <TermsContent />;
}
