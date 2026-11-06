import { describe, it, expect } from "vitest";
import { shouldShowClientBonusTab } from "./ClientPanelView";

// Item 3 do pedido ("aba Bônus aparece no celular mas não no
// computador") — investigação confirmou que a condição de exibição desta
// aba NUNCA dependeu de largura de tela, só de dados (Clinic.
// fullFaceBonusEnabled + a rota existir neste contexto). A causa real era
// cache de um proxy/CDN na frente do Next pra /dashboard (ver
// next.config.test.ts). Este teste prova a parte de LÓGICA: pura,
// independente de viewport, visível quando liberada e oculta quando não.
describe("shouldShowClientBonusTab", () => {
  it("clínica liberada (fullFaceBonusEnabled true) e rota do bônus disponível: mostra a aba", () => {
    expect(shouldShowClientBonusTab("/dashboard/bonus", true)).toBe(true);
  });

  it("clínica NÃO liberada (fullFaceBonusEnabled false): não mostra a aba, mesmo com a rota disponível", () => {
    expect(shouldShowClientBonusTab("/dashboard/bonus", false)).toBe(false);
  });

  it("sem bonusHref (contexto que não oferece a rota do bônus): não mostra a aba, mesmo com a conta liberada", () => {
    expect(shouldShowClientBonusTab(undefined, true)).toBe(false);
  });

  it("nem liberada nem com rota: não mostra a aba", () => {
    expect(shouldShowClientBonusTab(undefined, false)).toBe(false);
  });
});
