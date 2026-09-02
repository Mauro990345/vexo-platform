import { Building2, Repeat } from "lucide-react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";

// Sidebar global do CRM — clínicas (todas) e a configuração de follow-up
// (compartilhada entre todas, não é por clínica). Sessão já garantida pelo
// layout pai (crm/layout.tsx); aqui só precisamos dos dados pra exibir.
export default async function CrmGlobalLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  return (
    <AppShell
      userLabel={`${session?.user.name} · ${session?.user.role === "INTERNAL_ADMIN" ? "Admin" : "Equipe"}`}
      navGroups={[
        {
          label: "Operação",
          items: [
            { href: "/crm", label: "Contas", icon: <Building2 className="h-4 w-4 shrink-0" strokeWidth={2} /> },
            { href: "/crm/follow-up", label: "Follow-up", icon: <Repeat className="h-4 w-4 shrink-0" strokeWidth={2} /> },
          ],
        },
      ]}
    >
      {children}
    </AppShell>
  );
}
