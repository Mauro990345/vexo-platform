// Responsividade (pedido explícito) da lista de Contas com o botão
// "Relatório" + o painel compacto (ver ClinicSearchList.tsx/
// ClinicReportPanel.tsx) nas 4 larguras pedidas — mesmo padrão de teste
// real (Playwright, Tailwind compilado) já usado em
// automacoes/page.layout.test.ts.
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { chromium, type Browser } from "playwright";

const PROJECT_ROOT = path.resolve(__dirname, "../../../..");

vi.mock("@/lib/session", () => ({
  requireInternalSession: vi.fn(async () => ({ user: { role: "INTERNAL_ADMIN" } })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clinic: {
      findMany: vi.fn(async () => [
        { id: "clinic-1", name: "Clínica Demo VEXO", active: true },
        { id: "clinic-2", name: "Clínica com Nome Bem Longo Pra Testar Truncamento Real", active: true },
      ]),
    },
    clinicReportConfig: {
      findMany: vi.fn(async () => [
        { clinicId: "clinic-1", frequency: "MONTHLY", monthlyDayMode: "LAST_DAY", monthlyFixedDay: null, sendHour: 17, sendMinute: 0 },
      ]),
    },
  },
}));

const MOBILE_WIDTHS = [360, 390, 414];
const DESKTOP_WIDTH = 1366;

describe("Contas — lista com botão Relatório, sem rolagem horizontal", () => {
  let browser: Browser;
  let compiledCss: string;
  let html: string;

  beforeAll(async () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), "vexo-contas-overflow-"));
    const outCssPath = path.join(tmpDir, "compiled.css");
    execFileSync("npx", ["tailwindcss", "-i", "./src/app/globals.css", "-o", outCssPath, "--minify"], { cwd: PROJECT_ROOT, stdio: "pipe" });
    compiledCss = readFileSync(outCssPath, "utf8");
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

    const { default: ClinicsOverviewPage } = await import("./page");
    const element = await ClinicsOverviewPage({ searchParams: {} });
    const markup = renderToStaticMarkup(createElement("div", null, element));
    html = `<!DOCTYPE html><html class="dark"><head><meta charset="utf-8"><style>${compiledCss}</style></head><body class="bg-vexo-bg text-vexo-fg antialiased"><main class="px-4 py-6">${markup}</main></body></html>`;
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
  });

  for (const width of [...MOBILE_WIDTHS, DESKTOP_WIDTH]) {
    it(`${width}px: sem rolagem horizontal da página`, async () => {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.setContent(html);
      await page.waitForTimeout(30);

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth, `${width}px: scrollWidth (${scrollWidth}) > clientWidth (${clientWidth})`).toBeLessThanOrEqual(clientWidth);

      await page.close();
    });

    it(`${width}px: "Relatório" e "Excluir" cabem na linha sem sobrepor o nome da clínica, com espaço entre os dois`, async () => {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.setContent(html);
      await page.waitForTimeout(30);

      const row = page.locator("li", { hasText: "Clínica com Nome Bem Longo" });
      const nameBox = await row.getByText("Clínica com Nome Bem Longo", { exact: false }).boundingBox();
      const reportBox = await row.getByRole("button", { name: /^Relatório/ }).boundingBox();
      const deleteBox = await row.getByRole("button", { name: "Excluir" }).boundingBox();

      expect(nameBox).not.toBeNull();
      expect(reportBox).not.toBeNull();
      expect(deleteBox).not.toBeNull();

      // Nunca sobrepostos entre si (o nome termina antes do botão
      // Relatório começar, que termina antes do Excluir começar).
      expect(nameBox!.x + nameBox!.width).toBeLessThanOrEqual(reportBox!.x + 1);
      expect(reportBox!.x + reportBox!.width).toBeLessThan(deleteBox!.x);
      // Espaço real entre Relatório e Excluir (pedido explícito, "evitar
      // clique errado") — mais que só os 1-2px de uma borda encostada.
      expect(deleteBox!.x - (reportBox!.x + reportBox!.width)).toBeGreaterThan(4);

      await page.close();
    });
  }

  it("clínica com envio automático ligado mostra 'Relatório · DD/MM' (texto discreto do próximo envio)", async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    await page.setContent(html);
    await page.waitForTimeout(30);

    const text = await page.getByRole("button", { name: /^Relatório/ }).first().textContent();
    expect(text).toMatch(/Relatório · \d{2}\/\d{2}/);

    await page.close();
  });
});
