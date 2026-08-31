import { requireInternalSession } from "@/lib/session";
import { AppShell } from "@/components/AppShell";

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const session = await requireInternalSession();

  return (
    <AppShell
      title="CRM"
      userLabel={`${session.user.name} · ${session.user.role === "INTERNAL_ADMIN" ? "Admin" : "Equipe"}`}
      navItems={[{ href: "/crm", label: "Clínicas" }]}
    >
      {children}
    </AppShell>
  );
}
