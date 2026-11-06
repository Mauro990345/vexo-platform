import { describe, it, expect } from "vitest";
import nextConfig from "./next.config.js";

// Item 3 do pedido ("aba Bônus aparece no celular mas não no
// computador") — causa raiz NÃO era uma condição de largura de tela (ver
// ClientPanelView.test.ts, shouldShowClientBonusTab): era um proxy/CDN na
// frente do Next que podia cachear a resposta de /dashboard de antes do
// interruptor Clinic.fullFaceBonusEnabled ser ligado, sem o Cache-Control
// explícito que /crm/* já tinha (mesma causa raiz já documentada e
// corrigida ali numa rodada anterior). Este teste confirma que /dashboard
// ganhou o mesmo reforço, sem deixar de cobrir /crm/*.
describe("next.config.js headers()", () => {
  it("cobre /crm/:path* com Cache-Control: no-store (comportamento já existente, intocado)", async () => {
    const rules = await nextConfig.headers!();
    const crmRule = rules.find((r) => r.source === "/crm/:path*");
    expect(crmRule).toBeDefined();
    expect(crmRule!.headers).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: "Cache-Control", value: "no-store, must-revalidate" })])
    );
  });

  it("cobre /dashboard/:path* com o mesmo Cache-Control: no-store (correção desta rodada)", async () => {
    const rules = await nextConfig.headers!();
    const dashboardRule = rules.find((r) => r.source === "/dashboard/:path*");
    expect(dashboardRule).toBeDefined();
    expect(dashboardRule!.headers).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: "Cache-Control", value: "no-store, must-revalidate" })])
    );
  });
});
