import { LayoutGrid, Repeat2 } from "lucide-react";
import { requireInternalSession } from "@/lib/session";
import { AppShell } from "@/components/AppShell";

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const session = await requireInternalSession();

  return (
    <AppShell
      sectionLabel="CRM"
      userLabel={`${session.user.name} · ${session.user.role === "INTERNAL_ADMIN" ? "Admin" : "Equipe"}`}
      navItems={[
        { href: "/crm", label: "Clínicas", icon: <LayoutGrid className="h-4 w-4 shrink-0" strokeWidth={2} /> },
        { href: "/crm/follow-up", label: "Follow-up", icon: <Repeat2 className="h-4 w-4 shrink-0" strokeWidth={2} /> },
      ]}
    >
      {children}
    </AppShell>
  );
}
