// Prévia isolada de paleta nova (2ª rodada, corrigida) — pedido explícito:
// "testar numa página só" = SÓ Automações desta vez (/crm/clinicas/[id]/
// automacoes), sidebar incluída enquanto nessa página; a Pipeline (alvo
// errado da 1ª rodada) foi revertida e fica fora do escopo. O mecanismo
// (ver AutomacoesPalettePreview.tsx e o bloco .vxa-preview em
// src/app/globals.css) depende de dois pressupostos que este teste trava:
//
// 1. A classe .vxa-preview só é aplicada quando o pathname é EXATAMENTE
//    /crm/clinicas/[id]/automacoes — a Pipeline (mesma clínica, rota
//    irmã) NÃO ativa a prévia, então continua 100% no visual azul padrão.
// 2. globals.css usa um SELETOR CSS (".bg-vexo-petrol.text-vexo-accent",
//    ".text-sidebar-item.font-medium") pra estilizar só o item ATIVO da
//    sidebar, sem editar AppShell.tsx — depende do className exato que
//    AppShell.tsx usa hoje pro link ativo. Se mudar no futuro, o seletor
//    para de bater e a prévia volta ao visual antigo silenciosamente;
//    este teste confirma que a combinação de classes ainda existe no HTML
//    renderizado de verdade.
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { chromium, type Browser } from "playwright";

const PROJECT_ROOT = path.resolve(__dirname, "../..");

let currentPathname = "/crm/clinicas/clinic-1/automacoes";
vi.mock("next/navigation", () => ({
  usePathname: () => currentPathname,
}));

describe("AutomacoesPalettePreview — ativa .vxa-preview só na aba Automações", () => {
  let browser: Browser;
  let compiledCss: string;

  beforeAll(async () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), "vexo-automacoes-preview-"));
    const outCssPath = path.join(tmpDir, "compiled.css");
    execFileSync("npx", ["tailwindcss", "-i", "./src/app/globals.css", "-o", outCssPath, "--minify"], { cwd: PROJECT_ROOT, stdio: "pipe" });
    compiledCss = readFileSync(outCssPath, "utf8");
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
  });

  async function renderShell(pathname: string) {
    currentPathname = pathname;
    const { AutomacoesPalettePreview } = await import("./AutomacoesPalettePreview");
    const { AppShell } = await import("./AppShell");

    const markup = renderToStaticMarkup(
      createElement(AutomacoesPalettePreview, {
        clinicId: "clinic-1",
        children: createElement(AppShell, {
          userLabel: "Usuário · Admin",
          navGroups: [
            {
              label: "Operação",
              items: [
                { href: "/crm/clinicas/clinic-1", label: "Pipeline", icon: createElement("svg", { "data-testid": "icon-pipeline" }) },
                { href: "/crm/clinicas/clinic-1/automacoes", label: "Automações", icon: createElement("svg", { "data-testid": "icon-automacoes" }) },
              ],
            },
          ],
          children: createElement("div", { id: "page-content" }, "conteúdo da página"),
        }),
      })
    );

    const page = await browser.newPage();
    await page.setContent(`<!DOCTYPE html><html class="dark"><head><meta charset="utf-8"><style>${compiledCss}</style></head><body>${markup}</body></html>`);
    await page.waitForTimeout(100);
    return { page, markup };
  }

  it("na aba Automações exata: .vxa-preview aplicada, sidebar vira cinza-azulado escuro e o item ativo fica branco/sutil com indicador", async () => {
    const { page, markup } = await renderShell("/crm/clinicas/clinic-1/automacoes");

    expect(markup).toContain('class="vxa-preview"');
    expect(markup).toMatch(/class="[^"]*\bbg-vexo-petrol\b[^"]*\btext-vexo-accent\b[^"]*"/);
    expect(markup).toMatch(/class="[^"]*\btext-sidebar-item\b[^"]*\bfont-medium\b[^"]*"/);

    const sidebarBg = await page.$eval("aside", (el) => getComputedStyle(el).backgroundColor);
    expect(sidebarBg).toBe("rgb(22, 25, 32)"); // --vxa-sidebar, #161920

    const activeLink = await page.$eval("a.bg-vexo-petrol.text-vexo-accent", (el) => {
      const s = getComputedStyle(el);
      return { bg: s.backgroundColor, boxShadow: s.boxShadow };
    });
    expect(activeLink.bg).toBe("rgb(32, 40, 52)"); // --vxa-nav-active-bg, fundo sutil
    expect(activeLink.boxShadow).toContain("rgb(91, 134, 176)"); // indicador vertical de 2px, cor do azul fosco

    const activeLabelColor = await page.$$eval("aside a span.truncate", (spans) => {
      const el = spans.find((s) => s.textContent === "Automações");
      return el ? getComputedStyle(el).color : null;
    });
    expect(activeLabelColor).toBe("rgb(201, 204, 209)"); // --vxa-fg, branco acinzentado — não azul

    await page.close();
  });

  it("na Pipeline (rota irmã, mesma clínica): .vxa-preview NÃO aplicada — sidebar continua no azul padrão", async () => {
    const { page, markup } = await renderShell("/crm/clinicas/clinic-1");

    expect(markup).not.toContain('class="vxa-preview"');

    const sidebarBg = await page.$eval("aside", (el) => getComputedStyle(el).backgroundColor);
    expect(sidebarBg).toBe("rgb(20, 26, 36)"); // --vexo-surface padrão, azul-marinho

    await page.close();
  });

  it("logo/quadrado do VEXO fica no azul fosco dentro da prévia", async () => {
    const { page } = await renderShell("/crm/clinicas/clinic-1/automacoes");
    const logoBg = await page.$eval("aside span.bg-vexo-accent", (el) => getComputedStyle(el).backgroundColor);
    expect(logoBg).toBe("rgb(91, 134, 176)");
    await page.close();
  });

  it("ícones ficam com traço mais fino dentro da prévia (1.5px, era 2px)", async () => {
    const { page } = await renderShell("/crm/clinicas/clinic-1/automacoes");
    const strokeWidth = await page.$eval('[data-testid="icon-automacoes"]', (el) => getComputedStyle(el).strokeWidth);
    expect(strokeWidth).toBe("1.5px");
    await page.close();
  });

  it("rótulo do menu mais discreto (peso 400/12px, eram 500/13px)", async () => {
    const { page } = await renderShell("/crm/clinicas/clinic-1/automacoes");
    const style = await page.$eval("a.bg-vexo-petrol.text-vexo-accent", (el) => {
      const s = getComputedStyle(el);
      return { fontWeight: s.fontWeight, fontSize: s.fontSize };
    });
    expect(style.fontWeight).toBe("400");
    expect(style.fontSize).toBe("12px");
    await page.close();
  });
});
