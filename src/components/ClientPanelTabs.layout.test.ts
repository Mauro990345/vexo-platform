// Teste de layout — item 3 do pedido ("aba Bônus aparece no celular mas
// não no computador"). Investigação confirmou que ClientPanelTabs não tem
// NENHUMA condição de largura de tela (nem classe hidden/sm:hidden, nem
// media query escondendo a aba) — a causa real era cache de proxy/CDN
// pra /dashboard (ver next.config.test.ts). Este teste prova a parte
// visual: a aba "Bônus Full Face", uma vez renderizada pelo componente
// (decisão tomada por shouldShowClientBonusTab, ver ClientPanelView.test.ts),
// fica VISÍVEL (largura > 0, não clipada/escondida) tanto em largura de
// celular quanto de computador — mesma metodologia das outras suítes de
// layout (browser real via Playwright, CSS compilado de verdade pelo
// Tailwind CLI do projeto).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { chromium, type Browser } from "playwright";
import { ClientPanelTabs } from "./ClientPanelTabs";

const PROJECT_ROOT = path.resolve(__dirname, "../..");

describe("ClientPanelTabs — layout real (celular e computador)", () => {
  let compiledCss: string;
  let browser: Browser;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "vexo-bonus-tabs-layout-"));
    const outCssPath = path.join(tmpDir, "compiled.css");
    execFileSync("npx", ["tailwindcss", "-i", "./src/app/globals.css", "-o", outCssPath, "--minify"], { cwd: PROJECT_ROOT, stdio: "pipe" });
    compiledCss = readFileSync(outCssPath, "utf8");

    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  async function measure(viewportWidth: number) {
    const markup = renderToStaticMarkup(
      createElement(ClientPanelTabs, { active: "painel", panelHref: "/dashboard", bonusHref: "/dashboard/bonus" })
    );
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${compiledCss}</style>
    <style>body{margin:0;background:#0b0f17;padding:16px;}</style></head><body>${markup}</body></html>`;

    const page = await browser.newPage({ viewport: { width: viewportWidth, height: 400 } });
    await page.setContent(html);
    const bonusLink = page.locator('a:has-text("Bônus Full Face")');
    const box = await bonusLink.boundingBox();
    const visible = await bonusLink.isVisible();
    await page.close();
    return { box, visible };
  }

  it("320px (celular): a aba 'Bônus Full Face' está visível, com largura real", async () => {
    const { box, visible } = await measure(320);
    expect(visible).toBe(true);
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
  });

  it("430px (celular, maior): a aba continua visível", async () => {
    const { box, visible } = await measure(430);
    expect(visible).toBe(true);
    expect(box!.width).toBeGreaterThan(0);
  });

  it("1024px (computador): a aba está visível, com largura real", async () => {
    const { box, visible } = await measure(1024);
    expect(visible).toBe(true);
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
  });

  it("1440px (computador, maior): a aba continua visível", async () => {
    const { box, visible } = await measure(1440);
    expect(visible).toBe(true);
    expect(box!.width).toBeGreaterThan(0);
  });
});
