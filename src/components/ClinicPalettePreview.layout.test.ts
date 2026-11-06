// Prévia isolada de paleta nova (sidebar + Pipeline) — pedido explícito:
// "ativada só nessa página/sidebar", sem tocar nas --vexo-* padrão nem em
// nenhum componente. O mecanismo (ver ClinicPalettePreview.tsx e o bloco
// .vx-preview em src/app/globals.css) depende de dois pressupostos que
// este teste trava:
//
// 1. A classe .vx-preview só é aplicada quando o pathname é EXATAMENTE
//    /crm/clinicas/[id] (a Pipeline) — uma sub-rota como .../automacoes
//    não ativa a prévia, então continua 100% no visual azul padrão.
// 2. globals.css usa um SELETOR CSS (".bg-vexo-petrol.text-vexo-accent",
//    ".text-sidebar-item.font-medium") pra estilizar só o item ATIVO da
//    sidebar, sem editar AppShell.tsx — esse seletor depende do className
//    exato que AppShell.tsx usa hoje pro link ativo. Se alguém mudar esse
//    className no futuro, o seletor para de bater e a prévia volta ao
//    visual antigo silenciosamente; este teste confirma que a combinação
//    de classes ainda existe no HTML renderizado de verdade.
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { chromium, type Browser } from "playwright";

const PROJECT_ROOT = path.resolve(__dirname, "../..");

let currentPathname = "/crm/clinicas/clinic-1";
vi.mock("next/navigation", () => ({
  usePathname: () => currentPathname,
}));

describe("ClinicPalettePreview — ativa .vx-preview só na Pipeline exata", () => {
  let browser: Browser;
  let compiledCss: string;

  beforeAll(async () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), "vexo-palette-preview-"));
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
    const { ClinicPalettePreview } = await import("./ClinicPalettePreview");
    const { AppShell } = await import("./AppShell");

    const markup = renderToStaticMarkup(
      createElement(ClinicPalettePreview, {
        clinicId: "clinic-1",
        children: createElement(AppShell, {
          userLabel: "Usuário · Admin",
          navGroups: [
            {
              label: "Operação",
              items: [
                { href: "/crm/clinicas/clinic-1/conexoes", label: "Conexões", icon: createElement("svg", { "data-testid": "icon-conexoes" }) },
                { href: "/crm/clinicas/clinic-1", label: "Pipeline", icon: createElement("svg", { "data-testid": "icon-pipeline" }) },
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

  it("na Pipeline exata (/crm/clinicas/clinic-1): .vx-preview aplicada, sidebar vira grafite neutro e o item ativo fica branco/sutil", async () => {
    const { page, markup } = await renderShell("/crm/clinicas/clinic-1");

    expect(markup).toContain('class="vx-preview"');
    // Pressuposto 2: a combinação de classes do item ativo ainda existe.
    expect(markup).toMatch(/class="[^"]*\bbg-vexo-petrol\b[^"]*\btext-vexo-accent\b[^"]*"/);
    expect(markup).toMatch(/class="[^"]*\btext-sidebar-item\b[^"]*\bfont-medium\b[^"]*"/);

    const sidebarBg = await page.$eval("aside", (el) => getComputedStyle(el).backgroundColor);
    expect(sidebarBg).toBe("rgb(28, 28, 28)"); // --vxp-surface, grafite neutro

    const activeLabelColor = await page.$$eval("aside a span.truncate", (spans) => {
      const el = spans.find((s) => s.textContent === "Pipeline");
      return el ? getComputedStyle(el).color : null;
    });
    expect(activeLabelColor).toBe("rgb(237, 237, 237)"); // branco acinzentado, não azul

    await page.close();
  });

  it("numa sub-rota (/crm/clinicas/clinic-1/automacoes): .vx-preview NÃO aplicada — sidebar continua no azul padrão", async () => {
    const { page, markup } = await renderShell("/crm/clinicas/clinic-1/automacoes");

    expect(markup).not.toContain('class="vx-preview"');

    const sidebarBg = await page.$eval("aside", (el) => getComputedStyle(el).backgroundColor);
    expect(sidebarBg).toBe("rgb(20, 26, 36)"); // --vexo-surface padrão, azul-marinho

    await page.close();
  });

  it("logo/quadrado do VEXO fica no azul fosco dentro da prévia", async () => {
    const { page } = await renderShell("/crm/clinicas/clinic-1");
    const logoBg = await page.$eval("aside span.bg-vexo-accent", (el) => getComputedStyle(el).backgroundColor);
    expect(logoBg).toBe("rgb(78, 109, 136)");
    await page.close();
  });

  it("ícones ficam com traço mais fino dentro da prévia (1.75px, era 2px)", async () => {
    const { page } = await renderShell("/crm/clinicas/clinic-1");
    const strokeWidth = await page.$eval('[data-testid="icon-pipeline"]', (el) => getComputedStyle(el).strokeWidth);
    expect(strokeWidth).toBe("1.75px");
    await page.close();
  });
});
