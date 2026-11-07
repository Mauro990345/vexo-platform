// Prévia isolada de paleta nova (5ª rodada — simplificação) — pedido
// explícito: desfazer o teste de paleta das rodadas 2-4, mantendo SÓ a
// mudança do tom do azul. "Testar numa página só" continua valendo: SÓ
// Automações (/crm/clinicas/[id]/automacoes), sidebar incluída enquanto
// nessa página; a Pipeline (alvo errado da 1ª rodada) fica fora do
// escopo. O mecanismo (ver AutomacoesPalettePreview.tsx e o bloco
// .vxa-preview em src/app/globals.css) depende de um pressuposto que este
// teste trava:
//
// A classe .vxa-preview só é aplicada quando o pathname é EXATAMENTE
// /crm/clinicas/[id]/automacoes — a Pipeline (mesma clínica, rota irmã)
// NÃO ativa a prévia, então continua 100% no visual azul padrão.
//
// Tudo que as rodadas 2-4 tinham travado aqui (fundo/sidebar/card mais
// escuros, item ativo sem contorno/com cor própria, tipografia e ícones
// mais finos, off-white/cinza em duas camadas) voltou ao padrão global —
// não precisa mais de teste aqui, porque .vxa-preview não sobrescreve
// mais nada disso.
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

  it("na aba Automações exata: .vxa-preview aplicada, sidebar e item ativo continuam no padrão global — só o azul muda", async () => {
    const { page, markup } = await renderShell("/crm/clinicas/clinic-1/automacoes");

    expect(markup).toContain('class="vxa-preview"');
    expect(markup).toMatch(/class="[^"]*\bbg-vexo-petrol\b[^"]*\btext-vexo-accent\b[^"]*"/);

    const sidebarBg = await page.$eval("aside", (el) => getComputedStyle(el).backgroundColor);
    expect(sidebarBg).toBe("rgb(20, 26, 36)"); // --vexo-surface padrão, inalterado — não é mais sobrescrito

    const activeLink = await page.$eval("a.bg-vexo-petrol.text-vexo-accent", (el) => {
      const s = getComputedStyle(el);
      return { bg: s.backgroundColor, color: s.color, boxShadow: s.boxShadow, outlineStyle: s.outlineStyle, fontWeight: s.fontWeight, fontSize: s.fontSize };
    });
    expect(activeLink.bg).toBe("rgb(11, 36, 54)"); // --vexo-petrol padrão, inalterado — não é mais sobrescrito
    expect(activeLink.color).toBe("rgb(43, 135, 189)"); // --vexo-accent, o azul novo — único resquício do teste
    expect(activeLink.boxShadow).toBe("none");
    expect(activeLink.outlineStyle).toBe("none");
    expect(activeLink.fontWeight).toBe("500"); // peso padrão do text-sidebar-item, sem override
    expect(activeLink.fontSize).toBe("13px"); // tamanho padrão do text-sidebar-item, sem override

    await page.close();
  });

  it("na Pipeline (rota irmã, mesma clínica): .vxa-preview NÃO aplicada — sidebar continua no azul padrão", async () => {
    const { page, markup } = await renderShell("/crm/clinicas/clinic-1");

    expect(markup).not.toContain('class="vxa-preview"');

    const sidebarBg = await page.$eval("aside", (el) => getComputedStyle(el).backgroundColor);
    expect(sidebarBg).toBe("rgb(20, 26, 36)"); // --vexo-surface padrão, azul-marinho

    await page.close();
  });

  it("logo/quadrado do VEXO fica no azul novo dentro da prévia", async () => {
    const { page } = await renderShell("/crm/clinicas/clinic-1/automacoes");
    const logoBg = await page.$eval("aside span.bg-vexo-accent", (el) => getComputedStyle(el).backgroundColor);
    expect(logoBg).toBe("rgb(43, 135, 189)");
    await page.close();
  });
});
