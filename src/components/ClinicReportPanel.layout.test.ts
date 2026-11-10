// Responsividade do painel compacto "Relatório" (pedido explícito) nas 4
// larguras pedidas — mesmo padrão de teste real (Playwright, Tailwind
// compilado) já usado no resto do repo. Renderiza ClinicReportPanelBody
// DIRETO (sem passar pelo fetch de abrir o modal, que não roda em
// markup estático sem JS — ver comentário em page.layout.test.ts da
// pasta "Contas") com um estado inicial completo (pior caso: já tem
// entrega enviada, com link/token, pra exercitar TODOS os blocos:
// configuração, status e os botões de ação/link).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { chromium, type Browser } from "playwright";
import { ClinicReportPanelBody } from "./ClinicReportPanel";
import type { ClinicReportPanelData } from "@/app/crm/clinicas/report-actions";

const PROJECT_ROOT = path.resolve(__dirname, "../..");

const FULL_DATA: ClinicReportPanelData = {
  config: {
    whatsappNumber: "11988887777",
    frequency: "MONTHLY",
    monthlyDayMode: "LAST_DAY",
    monthlyFixedDay: null,
    sendHour: 17,
    sendMinute: 0,
    autoSendEnabled: true,
  },
  latestDelivery: {
    id: "delivery-1",
    periodLabel: "novembro de 2026",
    dateRange: "01/11 a 30/11",
    url: "https://app.vexo.ai/relatorio/token-de-teste-bem-longo-123456789",
    status: "SENT",
    trigger: "AUTO",
    attempt: 1,
    sentAt: "2026-11-30T20:00:00.000Z",
    lastAttemptAt: "2026-11-30T20:00:00.000Z",
    lastError: null,
  },
  nextSendDateLabel: "31/12",
  previewUrl: "/crm/clinicas/clinic-1/relatorio-preview",
  isSendAllowed: true,
};

const MOBILE_WIDTHS = [360, 390, 414];
const DESKTOP_WIDTH = 1366;

describe("ClinicReportPanel — layout real do painel compacto (pior caso: config + entrega + link), sem rolagem horizontal", () => {
  let browser: Browser;
  let compiledCss: string;
  let html: string;

  beforeAll(async () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), "vexo-report-panel-overflow-"));
    const outCssPath = path.join(tmpDir, "compiled.css");
    execFileSync("npx", ["tailwindcss", "-i", "./src/app/globals.css", "-o", outCssPath, "--minify"], { cwd: PROJECT_ROOT, stdio: "pipe" });
    compiledCss = readFileSync(outCssPath, "utf8");
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

    // Mesma estrutura de contêiner do modal real (ClinicReportModal) —
    // overlay + caixa max-w-md arredondada — copiada aqui só pra medir o
    // comportamento de verdade em cada largura de tela (o teste não
    // importa o modal inteiro porque ele busca os dados via useEffect,
    // que não roda em markup estático sem JS).
    const body = createElement(
      "div",
      { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" },
      createElement(
        "div",
        { className: "max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-vexo-border bg-vexo-surface p-5 shadow-xl" },
        createElement(ClinicReportPanelBody, { clinicId: "clinic-1", initialData: FULL_DATA, onUpdate: () => {} })
      )
    );
    const markup = renderToStaticMarkup(body);
    html = `<!DOCTYPE html><html class="dark"><head><meta charset="utf-8"><style>${compiledCss}</style></head><body class="bg-vexo-bg text-vexo-fg antialiased">${markup}</body></html>`;
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
  });

  for (const width of [...MOBILE_WIDTHS, DESKTOP_WIDTH]) {
    it(`${width}px: sem rolagem horizontal`, async () => {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      await page.setContent(html);
      await page.waitForTimeout(30);

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth, `${width}px: scrollWidth (${scrollWidth}) > clientWidth (${clientWidth})`).toBeLessThanOrEqual(clientWidth);

      await page.close();
    });
  }

  it("360px: todos os botões de ação (Enviar agora / Ver relatório / Copiar link / Revogar) ficam dentro do painel", async () => {
    const page = await browser.newPage({ viewport: { width: 360, height: 1000 } });
    await page.setContent(html);
    await page.waitForTimeout(30);

    const panelBox = await page.locator("div.max-w-md").boundingBox();
    for (const name of ["Enviar agora", "Ver relatório", "Copiar link", "Revogar"]) {
      const box = await page.getByText(name, { exact: true }).boundingBox();
      expect(box, `"${name}" não encontrado em 360px`).not.toBeNull();
      expect(box!.x + box!.width).toBeLessThanOrEqual(panelBox!.x + panelBox!.width + 1);
    }

    await page.close();
  });

  it("mostra o status do último envio (Enviado) e o próximo envio previsto", async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 1000 } });
    await page.setContent(html);
    await page.waitForTimeout(30);

    const bodyText = await page.textContent("body");
    expect(bodyText).toContain("Enviado");
    expect(bodyText).toContain("Próximo envio");
    expect(bodyText).toContain("31/12");

    await page.close();
  });
});
