import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isInternal } from "@/lib/session";
import { LoginForm } from "@/components/LoginForm";

export const metadata: Metadata = {
  title: "Entrar | VEXO IA",
  robots: { index: false, follow: false },
};

// Login da plataforma (antes em /login; a raiz "/" agora é a página pública).
// Já logado: manda direto pro app, como a raiz fazia antes — interno vai pro
// CRM, cliente pro dashboard.
export default async function EntrarPage() {
  const session = await getServerSession(authOptions);
  if (session) redirect(isInternal(session.user.role) ? "/crm" : "/dashboard");
  return <LoginForm />;
}
