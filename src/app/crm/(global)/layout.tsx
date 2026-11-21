import { Building2, Send, Activity } from "lucide-react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { prisma } from "@/lib/prisma";

// Sidebar global do CRM. "Contas" é só o seletor/busca de clínica. "Painel"
// e "Follow-up" (rotas /crm/painel e /crm/follow-up, que continuam
// existindo normalmente) saíram daqui pra não ficar duplicado: já aparecem
// na sidebar de dentro de cada clínica (ver buildClinicNavGroups em
// @/components/clinic-nav), que é de onde passaram a ser acessados.
// "Abordagem" (Fila de abordagem, ver DESIGN.md) é cross-clínica igual
// "Contas" — por isso fica aqui, não dentro de uma clínica específica.
// Sessão já garantida pelo layout pai (crm/layout.tsx); aqui só precisamos
// dos dados pra exibir. Mesma contagem que /crm/dispatch-status já usa pra
// "Mensagens que falharam ao enviar" (where: { status: "FAILED" }) — o
// badge do menu é só um atalho visual pra essa mesma informação, não uma
// consulta nova/separada.
export default async function CrmGlobalLayout({ children }: { children: React.ReactNode }) {
  const [session, failedCount] = await Promise.all([
    getServerSession(authOptions),
    prisma.message.count({ where: { status: "FAILED" } }),
  ]);

  return (
    <AppShell
      userLabel={`${session?.user.name} · ${session?.user.role === "INTERNAL_ADMIN" ? "Admin" : "Equipe"}`}
      navGroups={[
        {
          label: "Operação",
          items: [
            { href: "/crm", label: "Contas", icon: <Building2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} /> },
            { href: "/crm/abordagem", label: "Abordagem", icon: <Send className="h-3.5 w-3.5 shrink-0" strokeWidth={2} /> },
            {
              href: "/crm/dispatch-status",
              label: "Status",
              icon: <Activity className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />,
              badge: failedCount > 0 ? failedCount : undefined,
            },
          ],
        },
      ]}
    >
      {children}
    </AppShell>
  );
}
