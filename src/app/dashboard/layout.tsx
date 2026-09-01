import { requireClientSession } from "@/lib/session";
import { AppShell } from "@/components/AppShell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireClientSession();

  return (
    <AppShell
      title="Painel"
      userLabel={session.user.name ?? ""}
      navItems={[
        { href: "/dashboard", label: "Visão geral" },
        { href: "/dashboard/conversas", label: "Conversas" },
        { href: "/dashboard/agendamentos", label: "Agendamentos" },
        { href: "/dashboard/whatsapp", label: "WhatsApp" },
      ]}
    >
      {children}
    </AppShell>
  );
}
