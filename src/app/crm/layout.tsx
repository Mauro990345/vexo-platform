import { Building2, Repeat } from "lucide-react";
import { requireInternalSession } from "@/lib/session";
import { AppShell } from "@/components/AppShell";

// Grupo único "OPERAÇÃO": a referência também listava "Painel/Início" e
// "Pipeline" como itens separados, mas no VEXO hoje "/crm" já É a visão
// geral das clínicas (não existe uma home distinta) e o pipeline vive
// dentro da página de cada clínica (não é uma tela própria, multi-clínica)
// — apontar dois itens de menu pra essas mesmas telas seria redundante, e
// criar telas novas só pra preencher o menu fugiria de "só a camada visual
// muda". Mantidos os dois destinos reais que já existem, com os novos
// ícones/nomes da referência aplicados.
export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const session = await requireInternalSession();

  return (
    <AppShell
      userLabel={`${session.user.name} · ${session.user.role === "INTERNAL_ADMIN" ? "Admin" : "Equipe"}`}
      navGroups={[
        {
          label: "Operação",
          items: [
            { href: "/crm", label: "Clínicas", icon: <Building2 className="h-4 w-4 shrink-0" strokeWidth={2} /> },
            { href: "/crm/follow-up", label: "Follow-up", icon: <Repeat className="h-4 w-4 shrink-0" strokeWidth={2} /> },
          ],
        },
      ]}
    >
      {children}
    </AppShell>
  );
}
