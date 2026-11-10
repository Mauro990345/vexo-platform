// Responsividade do conteúdo do Relatório (pedido explícito, 2ª rodada):
// nas 4 larguras pedidas, sem rolagem horizontal da página E sem NENHUM
// rótulo cortado (bug relatado: "Taxa de comparecim...", "Comparec...",
// "Não comp..." apareciam truncados — ver MetricCard.tsx, que usa
// `truncate` no rótulo). Mesmo padrão de teste real (Playwright, Tailwind
// compilado) já usado no resto do repo.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { chromium, type Browser } from "playwright";
import { ClinicReportContent } from "./ClinicReportContent";
import { computeMonthlyPeriod } from "@/lib/report-period";
import type { ReportNumbersWithComparison } from "@/lib/report-metrics";

const PROJECT_ROOT = path.resolve(__dirname, "../..");

// Pior caso de texto: todos os rótulos mais longos presentes ao mesmo
// tempo, com taxa de comparecimento E comparação positiva nos 4 boxes do
// Resumo (as 2 linhas extras que o pedido original cortava).
const NUMBERS: ReportNumbersWithComparison = {
  period: computeMonthlyPeriod(new Date("2026-11-15T12:00:00.000Z")),
  funnel: { contacted: 128, inConversation: 94, scheduled: 47, attended: 36, noShow: 8 },
  attendanceRate: 0.766,
  followUpRecovered: 12,
  reactivation: { sent: 23, returned: 9 },
  isSimulated: false,
  previousComparison: { contactedPct: 14, inConversationPct: 9, scheduledPct: 22, attendedPct: 18 },
};

const MOBILE_WIDTHS = [360, 390, 414];
const DESKTOP_WIDTH = 1366;

const EXPECTED_LABELS = ["Abordados", "Em conversa", "Agendaram", "Compareceram", "Não compareceram", "Leads retomados", "Enviadas", "Voltaram"];

describe("ClinicReportContent — layout real, sem rolagem horizontal nem rótulo cortado", () => {
  let browser: Browser;
  let compiledCss: string;
  let html: string;

  beforeAll(async () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), "vexo-report-content-overflow-"));
    const outCssPath = path.join(tmpDir, "compiled.css");
    execFileSync("npx", ["tailwindcss", "-i", "./src/app/globals.css", "-o", outCssPath, "--minify"], { cwd: PROJECT_ROOT, stdio: "pipe" });
    compiledCss = readFileSync(outCssPath, "utf8");
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

    const element = createElement(ClinicReportContent, { clinicName: "Clínica com Nome Razoavelmente Longo", frequency: "MONTHLY", numbers: NUMBERS });
    const markup = renderToStaticMarkup(element);
    html = `<!DOCTYPE html><html class="dark"><head><meta charset="utf-8"><style>${compiledCss}</style></head><body class="bg-vexo-bg text-vexo-fg antialiased"><main class="px-4 py-6">${markup}</main></body></html>`;
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
  });

  for (const width of [...MOBILE_WIDTHS, DESKTOP_WIDTH]) {
    it(`${width}px: sem rolagem horizontal da página`, async () => {
      const page = await browser.newPage({ viewport: { width, height: 1200 } });
      await page.setContent(html);
      await page.waitForTimeout(30);

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth, `${width}px: scrollWidth (${scrollWidth}) > clientWidth (${clientWidth})`).toBeLessThanOrEqual(clientWidth);

      await page.close();
    });

    it(`${width}px: nenhum rótulo de box fica cortado (truncado com "...")`, async () => {
      const page = await browser.newPage({ viewport: { width, height: 1200 } });
      await page.setContent(html);
      await page.waitForTimeout(30);

      for (const label of EXPECTED_LABELS) {
        const locator = page.getByText(label, { exact: true });
        const count = await locator.count();
        expect(count, `rótulo "${label}" não encontrado por extenso em ${width}px (pode estar cortado)`).toBe(1);

        const isTruncated = await locator.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
        expect(isTruncated, `rótulo "${label}" está visualmente cortado em ${width}px`).toBe(false);
      }

      await page.close();
    });
  }

  it("mostra a taxa de comparecimento e a comparação dentro do box 'Compareceram', sem cortar nenhuma das duas linhas em 360px", async () => {
    const page = await browser.newPage({ viewport: { width: 360, height: 1200 } });
    await page.setContent(html);
    await page.waitForTimeout(30);

    const bodyText = await page.textContent("body");
    expect(bodyText).toContain("dos agendados");
    expect(bodyText).toContain("vs. anterior");

    await page.close();
  });
});
