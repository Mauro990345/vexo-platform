import { describe, it, expect } from "vitest";
import { buildClinicNavGroups } from "@/components/clinic-nav";

// O grupo "Status" tinha sido removido na PR #259 (quando o link ficou só
// no menu global) e voltou aqui — o acesso só pelo global forçava sair da
// clínica (clicar "Contas") pra checar uma falha dela. Agora os dois
// coexistem: este item mostra um badge filtrado SÓ pra esta clínica
// (statusFailedCount, calculado por quem chama buildClinicNavGroups —
// ver clinicas/[id]/layout.tsx/conversas/[id]/layout.tsx), igual em
// estilo ao badge do "Status" global (PR #258), mas com outra contagem.
describe("buildClinicNavGroups — grupo 'Status' de volta, com badge por clínica", () => {
  it("tem o grupo 'Status' com o item apontando pra /status desta clínica", () => {
    const groups = buildClinicNavGroups("clinic-1");
    const status = groups.find((g) => g.label === "Status");
    expect(status?.items).toEqual([expect.objectContaining({ href: "/crm/clinicas/clinic-1/status", label: "Status" })]);
  });

  it("statusFailedCount > 0: o item leva o badge com esse número", () => {
    const groups = buildClinicNavGroups("clinic-1", 3);
    const statusItem = groups.find((g) => g.label === "Status")!.items[0]!;
    expect(statusItem.badge).toBe(3);
  });

  it("statusFailedCount = 0 (ou omitido): sem badge nenhum", () => {
    expect(buildClinicNavGroups("clinic-1", 0).find((g) => g.label === "Status")!.items[0]!.badge).toBeUndefined();
    expect(buildClinicNavGroups("clinic-1").find((g) => g.label === "Status")!.items[0]!.badge).toBeUndefined();
  });

  it("nenhum grupo fica sem itens (sem cabeçalho de grupo vazio)", () => {
    const groups = buildClinicNavGroups("clinic-1");
    for (const group of groups) {
      expect(group.items.length).toBeGreaterThan(0);
    }
  });

  it("os itens de 'Operação' continuam todos presentes, sem o 'Status' misturado nele", () => {
    const groups = buildClinicNavGroups("clinic-1");
    const operacao = groups.find((g) => g.label === "Operação");
    expect(operacao?.items.map((i) => i.label)).toEqual([
      "Conexões",
      "Painel",
      "Pipeline",
      "Briefing",
      "Agente de IA",
      "Automações",
      "Follow-up",
      "Bônus",
    ]);
  });
});
