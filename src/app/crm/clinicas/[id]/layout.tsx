import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/AppShell";
import { buildClinicNavGroups, buildReviewerNavGroups } from "@/components/clinic-nav";

// Sidebar de UMA clínica específica — troca completamente em relação ao
// CRM global (ver crm/(global)/layout.tsx): Pipeline, Follow-up, WhatsApp,
// Instagram, Google Calendar e Configurações viram itens de primeiro
// nível, cada um com sua própria página, em vez de ficarem escondidos
// dentro de uma única tela de detalhes.
export default async function ClinicLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  const role = session?.user.role;
  const reviewer = role === "REVIEWER";

  const clinic = await prisma.clinic.findUnique({
    where: { id: params.id },
    select: { id: true, name: true },
  });
  if (!clinic) notFound();

  return (
    <AppShell
      userLabel={`${session?.user.name} · ${role === "INTERNAL_ADMIN" ? "Admin" : reviewer ? "Revisor" : "Equipe"}`}
      navGroups={reviewer ? buildReviewerNavGroups(clinic.id) : buildClinicNavGroups(clinic.id)}
      // Revisor nunca vê o link "Contas" (só tem uma clínica, sem seletor
      // nem volta pra lista geral — ver DESIGN.md) nem o "←", só o nome.
      contextHeader={
        <div className="rounded-lg bg-vexo-surface2 px-2 py-1.5">
          {reviewer ? (
            <p className="truncate text-xs font-medium">{clinic.name}</p>
          ) : (
            <>
              <Link href="/crm" className="flex items-center gap-1 text-card text-vexo-muted hover:text-vexo-fg">
                <ChevronLeft className="h-3 w-3 shrink-0" strokeWidth={2} />
                Contas
              </Link>
              <p className="mt-0.5 truncate text-xs font-medium">{clinic.name}</p>
            </>
          )}
        </div>
      }
    >
      {children}
    </AppShell>
  );
}
