// Prova que este ajuste visual (aba Follow-up — mesmos princípios do
// Painel do cliente aplicáveis a uma tela de CONFIGURAÇÃO, ver DESIGN.md:
// tokens rounded-block/p-block nos blocos, componente Button nos botões
// de salvar/adicionar) não quebrou o layout real da página — mesmo
// padrão do teste de Automações (page.layout.test.ts): renderiza a view
// de verdade (prisma/actions mockados, Tabs/TemplateMessageField/
// AttachmentField/Button reais) e confirma, nas 3 abas e nas 3 larguras
// de celular pedidas (360/390/414) mais o computador (1366), que não há
// rolagem horizontal.
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium, type Browser } from "playwright";

const PROJECT_ROOT = path.resolve(__dirname, "../../../../..");

const silenceStep = {
  id: "step-silence-1",
  trigger: "SILENCE",
  order: 0,
  offsetHours: 24,
  content: "Oi! Ainda tem interesse em agendar sua avaliação?",
  attachmentUrl: null,
  channel: "INSTAGRAM",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const noShowStep = {
  id: "step-no-show-1",
  trigger: "NO_SHOW",
  order: 0,
  offsetHours: 2,
  content: "Vimos que você não conseguiu vir — quer remarcar?",
  attachmentUrl: null,
  channel: "WHATSAPP",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    followUpStep: {
      findMany: vi.fn(async ({ where }: { where: { trigger: string } }) =>
        where.trigger === "SILENCE" ? [silenceStep] : [noShowStep]
      ),
    },
    followUpSettings: {
      findUnique: vi.fn(async () => ({ id: "singleton", silenceHours: 24 })),
    },
    noShowCardSettings: {
      findUnique: vi.fn(async () => ({ id: "singleton", day3Content: null, day10Content: null, day30Content: null })),
    },
    neverScheduledCardSettings: {
      findUnique: vi.fn(async () => ({
        id: "singleton",
        day2Content: null,
        day4Content: null,
        day10Content: null,
        day30Content: null,
        day60Content: null,
      })),
    },
    reactivationMessagesConfig: {
      findUnique: vi.fn(async () => ({ id: "singleton", message1: null, message2: null, message3: null, message4: null, message5: null })),
    },
    hotLeadMessagesConfig: {
      findUnique: vi.fn(async () => ({
        id: "singleton",
        step1Message1: null,
        step1Message2: null,
        step1Message3: null,
        step2Message1: null,
        step2Message2: null,
        step2Message3: null,
        step3Message1: null,
        step3Message2: null,
        step3Message3: null,
      })),
    },
  },
}));

vi.mock("./actions", () => ({
  addFollowUpStep: vi.fn(),
  updateFollowUpStep: vi.fn(),
  deleteFollowUpStep: vi.fn(),
  moveFollowUpStep: vi.fn(),
  updateFollowUpSettings: vi.fn(),
  updateNoShowFirstStepDelay: vi.fn(),
  updatePanelCardSettings: vi.fn(),
}));

const TAB_LABELS = ["Parou de responder", "Não compareceu", "Cards do Painel"];
const MOBILE_WIDTHS = [360, 390, 414];
const DESKTOP_WIDTH = 1366;

describe("Follow-up — layout real do ajuste visual (mesmos princípios do Painel aplicáveis a uma tela de configuração)", () => {
  let browser: Browser;
  let compiledCss: string;
  let html: string;

  beforeAll(async () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), "vexo-followup-overflow-"));
    const outCssPath = path.join(tmpDir, "compiled.css");
    execFileSync("npx", ["tailwindcss", "-i", "./src/app/globals.css", "-o", outCssPath, "--minify"], { cwd: PROJECT_ROOT, stdio: "pipe" });
    compiledCss = readFileSync(outCssPath, "utf8");
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

    const { FollowUpView } = await import("./FollowUpView");
    const element = await FollowUpView();
    const markup = renderToStaticMarkup(element);
    html = `<!DOCTYPE html><html class="dark"><head><meta charset="utf-8"><style>${compiledCss}</style></head><body class="bg-vexo-bg text-vexo-fg antialiased"><main class="px-4 py-6">${markup}</main></body></html>`;
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
  });

  for (const width of MOBILE_WIDTHS) {
    it(`${width}px: sem rolagem horizontal da página em nenhuma das 3 abas`, async () => {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
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

  it(`${DESKTOP_WIDTH}px (computador): sem rolagem nenhuma em nenhuma das 3 abas`, async () => {
    const page = await browser.newPage({ viewport: { width: DESKTOP_WIDTH, height: 1100 } });
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

  it("botões migrados (Button) renderizam normalmente — 'Salvar prazo' (outline) e 'Adicionar passo' (primary)", async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 1000 } });
    await page.setContent(html);
    await page.waitForTimeout(50);

    const saveButton = page.getByRole("button", { name: "Salvar prazo" }).first();
    expect(await saveButton.getAttribute("type")).toBe("submit");
    const saveBox = await saveButton.boundingBox();
    expect(saveBox?.height).toBeGreaterThan(0);

    const addButton = page.getByRole("button", { name: "Adicionar passo" });
    expect(await addButton.getAttribute("type")).toBe("submit");
    const addBox = await addButton.boundingBox();
    expect(addBox?.height).toBeGreaterThan(0);

    await page.close();
  });

  it("blocos recolhíveis (passo/grupo de textos) continuam com o conteúdo de sempre (sem perder informação na reorganização visual)", async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 1000 } });
    await page.setContent(html);
    await page.waitForTimeout(50);

    // Aba "Parou de responder" (default) já mostra o passo mockado.
    const bodyText = await page.textContent("body");
    expect(bodyText).toContain("Passo 1");
    expect(bodyText).toContain("24h");

    await page.getByRole("button", { name: "Cards do Painel", exact: true }).click();
    await page.waitForTimeout(30);
    const panelCardsText = await page.textContent("body");
    expect(panelCardsText).toContain("Faltou");
    expect(panelCardsText).toContain("Não agendou");
    expect(panelCardsText).toContain("Reativação");
    expect(panelCardsText).toContain("Quente");

    await page.close();
  });
});
