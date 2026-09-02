import { Home, MessagesSquare, CalendarDays, MessageCircle } from "lucide-react";
import { requireClientSession } from "@/lib/session";
import { AppShell } from "@/components/AppShell";

// Dois grupos, mesma convenção da referência: "Operação" (o dia a dia da
// clínica) separado de "Conexões" (canais externos — hoje só WhatsApp é
// self-service pro cliente; Instagram/Google Calendar continuam só no CRM
// interno, por desenho — não é a clínica que configura essas integrações).
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireClientSession();

  return (
    <AppShell
      userLabel={session.user.name ?? ""}
      navGroups={[
        {
          label: "Operação",
          items: [
            { href: "/dashboard", label: "Visão geral", icon: <Home className="h-4 w-4 shrink-0" strokeWidth={2} /> },
            { href: "/dashboard/conversas", label: "Conversas", icon: <MessagesSquare className="h-4 w-4 shrink-0" strokeWidth={2} /> },
            { href: "/dashboard/agendamentos", label: "Agendamentos", icon: <CalendarDays className="h-4 w-4 shrink-0" strokeWidth={2} /> },
          ],
        },
        {
          label: "Conexões",
          items: [
            { href: "/dashboard/whatsapp", label: "WhatsApp", icon: <MessageCircle className="h-4 w-4 shrink-0" strokeWidth={2} /> },
          ],
        },
      ]}
    >
      {children}
    </AppShell>
  );
}
