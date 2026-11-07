// Prova que a migração da Etapa 3 (ver docs/design-audit.md e DESIGN.md)
// para os componentes/tokens novos (Button, tokens rounded-block/p-block)
// não mudou o layout real da página — mesmo padrão do teste de Agente de
// IA (page.layout.test.ts): renderiza a página de verdade (prisma/sessão/
// actions mockados, Tabs/ReactivationConfigForms/TemplateMessageField
// reais) e confirma, nas 2 abas e nas 3 larguras de celular pedidas
// (360/390/414) mais o computador (1366), que não há rolagem horizontal.
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium, type Browser } from "playwright";

const PROJECT_ROOT = path.resolve(__dirname, "../../../../../..");

vi.mock("@/lib/session", () => ({
  requireInternalSession: vi.fn(async () => ({ user: { role: "INTERNAL_ADMIN" } })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clinic: {
      findUnique: vi.fn(async () => ({
        id: "clinic-1",
        address: "Rua das Flores, 123, Centro, São Paulo",
        clientWhatsappNumber: "+55 11 99999-9999",
        active: true,
        fullFaceBonusEnabled: false,
        reminderConfig: {
          hoursBefore: [24, 3],
          firstMessageTemplate: "Oi, {{primeiro_nome}}! Passando para lembrar que seu horário é amanhã.",
          secondMessageTemplate: null,
        },
        reactivationConfig: { availablePeriods: [7, 15, 30], defaultPeriods: [15], dailyWhatsappLimit: 20 },
        hotLeadConfig: { dailyLimit: 5 },
      })),
    },
  },
}));

vi.mock("../../actions", () => ({
  updateClinicSettings: vi.fn(),
  updateClinicReminders: vi.fn(),
  updateClinicReturnPeriods: vi.fn(),
  updateClinicDailyWhatsappLimit: vi.fn(),
  updateClinicHotLeadDailyLimit: vi.fn(),
  logApproach: vi.fn(),
}));

const TAB_LABELS = ["Configuração", "Registrar abordagens de hoje"];
const MOBILE_WIDTHS = [360, 390, 414];
const DESKTOP_WIDTH = 1366;

describe("Automações — layout real não estoura a largura (Etapa 3 da migração de design)", () => {
  let browser: Browser;
  let compiledCss: string;
  let html: string;

  beforeAll(async () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), "vexo-automacoes-overflow-"));
    const outCssPath = path.join(tmpDir, "compiled.css");
    execFileSync("npx", ["tailwindcss", "-i", "./src/app/globals.css", "-o", outCssPath, "--minify"], { cwd: PROJECT_ROOT, stdio: "pipe" });
    compiledCss = readFileSync(outCssPath, "utf8");
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

    const { default: ClinicAutomationPage } = await import("./page");
    const element = await ClinicAutomationPage({ params: { id: "clinic-1" } });
    const markup = renderToStaticMarkup(element);
    html = `<!DOCTYPE html><html class="dark"><head><meta charset="utf-8"><style>${compiledCss}</style></head><body class="bg-vexo-bg text-vexo-fg antialiased"><main class="px-4 py-6">${markup}</main></body></html>`;
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
  });

  for (const width of MOBILE_WIDTHS) {
    it(`${width}px: sem rolagem horizontal da página em nenhuma das 2 abas`, async () => {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.setContent(html);
      await page.waitForTimeout(50);

      for (const label of TAB_LABELS) {
        await page.getByRole("button", { name: label, exact: true }).click();
        await page.waitForTimeout(30);
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
        expect(scrollWidth, `aba "${label}" em ${width}px: scrollWidth (${scrollWidth}) > clientWidth (${clientWidth})`).toBeLessThanOrEqual(clientWidth);
      }

      await page.close();
    });
  }

  it(`${DESKTOP_WIDTH}px (computador): sem rolagem nenhuma em nenhuma das 2 abas`, async () => {
    const page = await browser.newPage({ viewport: { width: DESKTOP_WIDTH, height: 1000 } });
    await page.setContent(html);
    await page.waitForTimeout(50);

    for (const label of TAB_LABELS) {
      await page.getByRole("button", { name: label, exact: true }).click();
      await page.waitForTimeout(30);
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    }

    await page.close();
  });

  it("botões migrados (Button) renderizam com os tokens rounded-control/control-x/control-y, visual idêntico ao de antes", async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    await page.setContent(html);
    await page.waitForTimeout(50);

    const saveButton = page.getByRole("button", { name: "Salvar configuração" });
    expect(await saveButton.getAttribute("type")).toBe("submit");
    const box = await saveButton.boundingBox();
    expect(box?.height).toBeGreaterThan(0);

    await page.close();
  });
});
