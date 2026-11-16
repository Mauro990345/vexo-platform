import { Building2, Send } from "lucide-react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";

// Sidebar global do CRM. "Contas" é só o seletor/busca de clínica. "Painel"
// e "Follow-up" (rotas /crm/painel e /crm/follow-up, que continuam
// existindo normalmente) saíram daqui pra não ficar duplicado: já aparecem
// na sidebar de dentro de cada clínica (ver buildClinicNavGroups em
// @/components/clinic-nav), que é de onde passaram a ser acessados.
// "Abordagem" (Fila de abordagem, ver DESIGN.md) é cross-clínica igual
// "Contas" — por isso fica aqui, não dentro de uma clínica específica.
// Sessão já garantida pelo layout pai (crm/layout.tsx); aqui só precisamos
// dos dados pra exibir.
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
            { href: "/crm/abordagem", label: "Abordagem", icon: <Send className="h-3.5 w-3.5 shrink-0" strokeWidth={2} /> },
          ],
        },
      ]}
    >
      {children}
    </AppShell>
  );
}
