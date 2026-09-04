import { Building2, LayoutDashboard, Repeat } from "lucide-react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";

// Sidebar global do CRM. "Contas" é só o seletor/busca de clínica; as
// métricas por clínica (que antes ficavam misturadas ali) moraram pra
// "Painel", que também reúne o acesso do cliente ao painel dele (antes um
// card dentro de Automações). A config de follow-up é compartilhada entre
// todas as clínicas, não é por clínica. Sessão já garantida pelo layout pai
// (crm/layout.tsx); aqui só precisamos dos dados pra exibir.
export default async function CrmGlobalLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  return (
    <AppShell
      userLabel={`${session?.user.name} · ${session?.user.role === "INTERNAL_ADMIN" ? "Admin" : "Equipe"}`}
      navGroups={[
        {
          label: "Operação",
          items: [
            { href: "/crm", label: "Contas", icon: <Building2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} /> },
            { href: "/crm/painel", label: "Painel", icon: <LayoutDashboard className="h-3.5 w-3.5 shrink-0" strokeWidth={2} /> },
            { href: "/crm/follow-up", label: "Follow-up", icon: <Repeat className="h-3.5 w-3.5 shrink-0" strokeWidth={2} /> },
          ],
        },
      ]}
    >
      {children}
    </AppShell>
  );
}
