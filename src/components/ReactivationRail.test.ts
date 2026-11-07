import { describe, it, expect } from "vitest";
import { shouldShowReactivationReturnLine } from "./ReactivationRail";

// Item do pedido ("se não houver nenhuma enviada no período, não mostrar
// a linha") — mesmo padrão de shouldShowClientBonusTab em
// ClientPanelView.test.ts: lógica de exibição extraída como função pura,
// testada direto, sem precisar renderizar o componente inteiro.
describe("shouldShowReactivationReturnLine", () => {
  it("sem nenhuma enviada no período (sent=0): não mostra", () => {
    expect(shouldShowReactivationReturnLine({ sent: 0, returned: 0 })).toBe(false);
  });

  it("returnMetric ausente (undefined): não mostra", () => {
    expect(shouldShowReactivationReturnLine(undefined)).toBe(false);
  });

  it("pelo menos uma enviada: mostra, mesmo com zero retornos", () => {
    expect(shouldShowReactivationReturnLine({ sent: 1, returned: 0 })).toBe(true);
  });

  it("enviadas e retornos: mostra", () => {
    expect(shouldShowReactivationReturnLine({ sent: 18, returned: 5 })).toBe(true);
  });
});
