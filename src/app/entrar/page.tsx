import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isInternal } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { DEMO_CLINIC_ID } from "@/lib/demo-clinic";
import { LoginForm } from "@/components/LoginForm";

export const metadata: Metadata = {
  title: "Entrar | VEXO IA",
  robots: { index: false, follow: false },
};

// Login da plataforma (antes em /login; a raiz "/" agora é a página pública).
// Já logado: manda direto pro app, como a raiz fazia antes — interno vai pro
// CRM, cliente pro dashboard, Revisor direto pras Conexões da Clínica Demo
// (único lugar que ele enxerga, ver UserRole.REVIEWER/DESIGN.md).
//
// A checagem de `active` (ver User.active, session.ts) também mora aqui,
// não só em requireSession — sem isso, um usuário desativado que ainda
// tem o cookie de sessão entraria num loop (requireSession manda pra cá,
// esta página manda de volta pra dentro do app, que manda de volta pra
// cá...). Desativado: cai pro formulário de login normal, como se não
// estivesse logado.
export default async function EntrarPage() {
  const session = await getServerSession(authOptions);
  if (session) {
    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { active: true } });
    if (user?.active) {
      if (session.user.role === "REVIEWER") redirect(`/crm/clinicas/${DEMO_CLINIC_ID}/conexoes`);
      redirect(isInternal(session.user.role) ? "/crm" : "/dashboard");
    }
  }
  return <LoginForm />;
}
