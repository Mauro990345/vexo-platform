import { requireClientSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { StatusBadge } from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

export default async function ClientConversationsPage() {
  const session = await requireClientSession();
  const clinicId = session.user.clinicId as string;

  const conversations = await prisma.conversation.findMany({
    where: { clinicId },
    include: { lead: true },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold tracking-tight">Conversas</h1>
      <div className="divide-y divide-vexo-border rounded-2xl border border-vexo-border bg-vexo-surface">
        {conversations.map((conv) => (
          <div key={conv.id} className="flex items-center justify-between px-4 py-3 transition hover:bg-vexo-surface2">
            <div>
              <p className="text-sm font-medium">{conv.lead.name ?? conv.lead.igUsername ?? "Lead"}</p>
              <p className="text-xs text-vexo-muted">
                {conv.lastMessageAt
                  ? new Date(conv.lastMessageAt).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—"}
              </p>
            </div>
            <StatusBadge status={conv.status} />
          </div>
        ))}
        {conversations.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-vexo-muted">Nenhuma conversa ainda.</p>
        )}
      </div>
    </div>
  );
}
