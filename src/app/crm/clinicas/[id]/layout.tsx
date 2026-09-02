import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/AppShell";
import { buildClinicNavGroups } from "@/components/clinic-nav";

// Sidebar de UMA clínica específica — troca completamente em relação ao
// CRM global (ver crm/(global)/layout.tsx): Pipeline, Follow-up, Agenda,
// WhatsApp, Instagram, Google Calendar e Configurações viram itens de
// primeiro nível, cada um com sua própria página, em vez de ficarem
// escondidos dentro de uma única tela de detalhes.
export default async function ClinicLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);

  const clinic = await prisma.clinic.findUnique({
    where: { id: params.id },
    select: { id: true, name: true },
  });
  if (!clinic) notFound();

  return (
    <AppShell
      userLabel={`${session?.user.name} · ${session?.user.role === "INTERNAL_ADMIN" ? "Admin" : "Equipe"}`}
      navGroups={buildClinicNavGroups(clinic.id)}
      contextHeader={
        <div className="rounded-lg bg-vexo-surface2 px-2.5 py-2">
          <Link href="/crm" className="flex items-center gap-1 text-xs text-vexo-muted hover:text-vexo-fg">
            <ChevronLeft className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            Clínicas
          </Link>
          <p className="mt-1 truncate text-sm font-medium">{clinic.name}</p>
        </div>
      }
    >
      {children}
    </AppShell>
  );
}
