import type { Metadata } from "next";
import { TermsContent } from "@/components/public/TermsContent";

export const metadata: Metadata = {
  title: "Termos de uso | VEXO IA",
  description: "Condições de uso da plataforma VEXO IA por clínicas de saúde.",
  alternates: { canonical: "/termos" },
};

export default function TermsPage() {
  return <TermsContent />;
}
