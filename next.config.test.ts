import { describe, it, expect } from "vitest";
// next.config.js é JS puro (sem .d.ts) — o import funciona normalmente em
// runtime (vitest/esbuild), só o typecheck isolado precisa do escape abaixo.
// @ts-expect-error — módulo JS sem declaração de tipos
import nextConfig from "./next.config.js";

type HeaderRule = { source: string; headers: Array<{ key: string; value: string }> };

// Cache-Control: no-store explícito pra /crm/* e /dashboard/* — reforço
// defensivo contra um proxy/CDN na frente do Next que não respeite os
// headers de cache padrão de uma rota dinâmica (ver next.config.js pro
// histórico completo). NÃO é, por si só, a causa do bug "aba Bônus
// aparece no celular mas não no computador" — essa causa foi confirmada
// como uma prop `bonusHref` simplesmente ausente numa das rotas que
// montam o Painel (ver src/app/client-panel-bonus-routes.test.ts). Este
// teste só garante que o reforço de cache continua cobrindo as duas rotas.
describe("next.config.js headers()", () => {
  it("cobre /crm/:path* com Cache-Control: no-store (comportamento já existente, intocado)", async () => {
    const rules = (await nextConfig.headers!()) as HeaderRule[];
    const crmRule = rules.find((r: HeaderRule) => r.source === "/crm/:path*");
    expect(crmRule).toBeDefined();
    expect(crmRule!.headers).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: "Cache-Control", value: "no-store, must-revalidate" })])
    );
  });

  it("cobre /dashboard/:path* com o mesmo Cache-Control: no-store", async () => {
    const rules = (await nextConfig.headers!()) as HeaderRule[];
    const dashboardRule = rules.find((r: HeaderRule) => r.source === "/dashboard/:path*");
    expect(dashboardRule).toBeDefined();
    expect(dashboardRule!.headers).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: "Cache-Control", value: "no-store, must-revalidate" })])
    );
  });
});
