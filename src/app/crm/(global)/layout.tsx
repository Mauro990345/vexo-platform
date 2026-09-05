import { Building2 } from "lucide-react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";

// Sidebar global do CRM. "Contas" é só o seletor/busca de clínica — único
// item deste nível. "Painel" e "Follow-up" (rotas /crm/painel e
// /crm/follow-up, que continuam existindo normalmente) saíram daqui pra
// não ficar duplicado: já aparecem na sidebar de dentro de cada clínica
// (ver buildClinicNavGroups em @/components/clinic-nav), que é de onde
// passaram a ser acessados. Sessão já garantida pelo layout pai
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
          ],
        },
      ]}
    >
      {children}
    </AppShell>
  );
}
