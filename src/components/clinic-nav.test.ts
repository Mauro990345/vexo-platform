import { describe, it, expect } from "vitest";
import { buildClinicNavGroups } from "@/components/clinic-nav";

// Pedido explícito: o item "Status" dentro da sidebar de CADA clínica
// ficou redundante depois que o menu global ganhou seu próprio link
// "Status" com badge de falhas (PR #258) — removido aqui junto com o
// grupo inteiro (que não tinha mais nenhum outro item depois disso),
// sem remover a rota /crm/clinicas/[id]/status em si.
describe("buildClinicNavGroups — grupo 'Status' removido (redundante com o menu global)", () => {
  it("não tem mais nenhum grupo chamado 'Status'", () => {
    const groups = buildClinicNavGroups("clinic-1");
    expect(groups.some((g) => g.label === "Status")).toBe(false);
  });

  it("não tem mais nenhum item apontando pra /status (nem em outro grupo)", () => {
    const groups = buildClinicNavGroups("clinic-1");
    const allHrefs = groups.flatMap((g) => g.items.map((i) => i.href));
    expect(allHrefs).not.toContain("/crm/clinicas/clinic-1/status");
  });

  it("nenhum grupo fica sem itens (sem cabeçalho de grupo vazio)", () => {
    const groups = buildClinicNavGroups("clinic-1");
    for (const group of groups) {
      expect(group.items.length).toBeGreaterThan(0);
    }
  });

  it("os outros itens de 'Operação' continuam todos presentes", () => {
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
