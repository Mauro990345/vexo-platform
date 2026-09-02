import { LayoutDashboard, MessageCircle, CalendarDays, Phone } from "lucide-react";
import { requireClientSession } from "@/lib/session";
import { AppShell } from "@/components/AppShell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireClientSession();

  return (
    <AppShell
      sectionLabel="Painel"
      userLabel={session.user.name ?? ""}
      navItems={[
        { href: "/dashboard", label: "Visão geral", icon: <LayoutDashboard className="h-4 w-4 shrink-0" strokeWidth={2} /> },
        { href: "/dashboard/conversas", label: "Conversas", icon: <MessageCircle className="h-4 w-4 shrink-0" strokeWidth={2} /> },
        { href: "/dashboard/agendamentos", label: "Agendamentos", icon: <CalendarDays className="h-4 w-4 shrink-0" strokeWidth={2} /> },
        { href: "/dashboard/whatsapp", label: "WhatsApp", icon: <Phone className="h-4 w-4 shrink-0" strokeWidth={2} /> },
      ]}
    >
      {children}
    </AppShell>
  );
}
