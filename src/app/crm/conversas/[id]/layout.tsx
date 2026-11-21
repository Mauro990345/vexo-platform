import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/AppShell";
import { buildClinicNavGroups, buildReviewerNavGroups } from "@/components/clinic-nav";

// Abrir uma conversa continua "dentro" do contexto da clínica dela — mesma
// sidebar de clinicas/[id]/layout.tsx, resolvendo a clínica a partir da
// conversa (a URL só tem o id da conversa, não o da clínica).
export default async function ConversationLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  const role = session?.user.role;
  const reviewer = role === "REVIEWER";

  const conversation = await prisma.conversation.findUnique({
    where: { id: params.id },
    select: { clinicId: true, clinic: { select: { name: true } } },
  });
  if (!conversation) notFound();

  // Mesma contagem que /crm/clinicas/[id]/status já usa (status "FAILED",
  // filtrado por conversation.clinicId) — só pro badge do item "Status" da
  // sidebar desta clínica, não uma regra nova.
  const statusFailedCount = reviewer
    ? 0
    : await prisma.message.count({
        where: { status: "FAILED", dismissedAt: null, conversation: { clinicId: conversation.clinicId } },
      });

  return (
    <AppShell
      userLabel={`${session?.user.name} · ${role === "INTERNAL_ADMIN" ? "Admin" : reviewer ? "Revisor" : "Equipe"}`}
      navGroups={
        reviewer ? buildReviewerNavGroups(conversation.clinicId) : buildClinicNavGroups(conversation.clinicId, statusFailedCount)
      }
      contextHeader={
        <div className="rounded-lg bg-vexo-surface2 px-2 py-1.5">
          {reviewer ? (
            <p className="truncate text-xs font-medium">{conversation.clinic.name}</p>
          ) : (
            <>
              <Link href="/crm" className="flex items-center gap-1 text-card text-vexo-muted hover:text-vexo-fg">
                <ChevronLeft className="h-3 w-3 shrink-0" strokeWidth={2} />
                Contas
              </Link>
              <p className="mt-0.5 truncate text-xs font-medium">{conversation.clinic.name}</p>
            </>
          )}
        </div>
      }
    >
      {children}
    </AppShell>
  );
}
