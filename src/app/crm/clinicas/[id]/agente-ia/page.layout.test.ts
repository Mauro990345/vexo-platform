// Bug real reportado: a página abria "pequena, encolhida pro canto
// esquerdo" no celular — sintoma de o navegador reduzir o zoom pra caber
// um elemento mais largo que a tela. Causa raiz identificada e corrigida
// em Tabs.tsx (ver Tabs.layout.test.ts, mesma correção testada de forma
// genérica pros 3 conjuntos de rótulos usados hoje no app): a linha de
// abas, sem overflow-x-auto, estourava a largura da PÁGINA inteira com 4
// rótulos longos e whitespace-nowrap.
//
// Este teste prova especificamente a página que motivou o pedido (Agente
// de IA) — renderizada de verdade (prisma/sessão/actions mockados, Tabs/
// PromptTextarea/ConfirmSubmitButton reais) — nas 3 larguras de celular
// pedidas (360/390/414) e confirmando que o computador (1366) continua
// sem nenhuma rolagem, em CADA uma das 4 abas (clicando nelas de verdade,
// já que só o conteúdo da aba ativa fica no layout — hidden, não só
// invisível).
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
        aiSystemPrompt: "Você é a assistente virtual da clínica X. Responda sempre em português, de forma acolhedora.",
        confirmationVideoUrl: "https://example.com/video.mp4",
        confirmationVideoCaption: "Vou te mandar um vídeo rápido mostrando como é o nosso atendimento 🙂",
        attendanceTipMessage: "Se puder, chegue uns 15 minutinhos antes, teremos um cafezinho te esperando.",
        attendanceFinalMessage: "Perfeito, até {{dia}}.",
        firstBandDelaySeconds: 45,
      })),
    },
    followUpSettings: { findUnique: vi.fn(async () => ({ windowDays: [1, 2, 3, 4, 5], windowStartMinute: 480, windowEndMinute: 1080 })) },
    aiSettings: { findUnique: vi.fn(async () => ({ adaptiveDelayEnabled: true })) },
    resultPhoto: {
      findMany: vi.fn(async () => [
        { id: "photo-1", category: "Harmonização facial completa com preenchimento", imageUrl: "https://example.com/a.jpg", caption: "Um resultado real" },
        { id: "photo-2", category: "Botox", imageUrl: "https://example.com/b.jpg", caption: null },
      ]),
    },
  },
}));

vi.mock("../../actions", () => ({
  updateAiAgentSettings: vi.fn(),
  updateAiAgentTiming: vi.fn(),
  addResultPhoto: vi.fn(),
  updateResultPhotoCaption: vi.fn(),
  deleteResultPhoto: vi.fn(),
}));

vi.mock("@/app/crm/(global)/follow-up/actions", () => ({
  updateAiSettings: vi.fn(),
  updateFollowUpWindow: vi.fn(),
}));

const TAB_LABELS = ["Prompt de conversação da IA", "Fotos de resultado", "Timing de resposta da IA", "Janela de envio"];
const MOBILE_WIDTHS = [360, 390, 414];
const DESKTOP_WIDTH = 1366;

describe("Agente de IA — página real não estoura a largura no celular (bug reportado)", () => {
  let browser: Browser;
  let compiledCss: string;
  let html: string;

  beforeAll(async () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), "vexo-agente-ia-overflow-"));
    const outCssPath = path.join(tmpDir, "compiled.css");
    execFileSync("npx", ["tailwindcss", "-i", "./src/app/globals.css", "-o", outCssPath, "--minify"], { cwd: PROJECT_ROOT, stdio: "pipe" });
    compiledCss = readFileSync(outCssPath, "utf8");
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

    const { default: ClinicAiAgentPage } = await import("./page");
    const element = await ClinicAiAgentPage({ params: { id: "clinic-1" } });
    const markup = renderToStaticMarkup(element);
    // bg-vexo-bg/px-4/py-6 reproduzindo o <main> real de AppShell.tsx (ver
    // src/components/AppShell.tsx) — sem isso o teste checaria só o
    // conteúdo da página isolado, sem o padding real que soma à largura.
    html = `<!DOCTYPE html><html class="dark"><head><meta charset="utf-8"><style>${compiledCss}</style></head><body class="bg-vexo-bg text-vexo-fg antialiased"><main class="px-4 py-6">${markup}</main></body></html>`;
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
  });

  for (const width of MOBILE_WIDTHS) {
    it(`${width}px: sem rolagem horizontal da página em nenhuma das 4 abas`, async () => {
      const page = await browser.newPage({ viewport: { width, height: 700 } });
      await page.setContent(html);
      await page.waitForTimeout(50);

      for (const label of TAB_LABELS) {
        await page.getByRole("button", { name: label }).click();
        await page.waitForTimeout(30);
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
        expect(scrollWidth, `aba "${label}" em ${width}px: scrollWidth (${scrollWidth}) > clientWidth (${clientWidth})`).toBeLessThanOrEqual(clientWidth);
      }

      await page.close();
    });
  }

  it(`${DESKTOP_WIDTH}px (computador): sem rolagem nenhuma em nenhuma das 4 abas — visual de antes mantido`, async () => {
    const page = await browser.newPage({ viewport: { width: DESKTOP_WIDTH, height: 900 } });
    await page.setContent(html);
    await page.waitForTimeout(50);

    for (const label of TAB_LABELS) {
      await page.getByRole("button", { name: label }).click();
      await page.waitForTimeout(30);
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    }

    await page.close();
  });

  it("o prompt (textarea monoespaçada) ocupa 100% do container, nunca mais largo que ele", async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 700 } });
    await page.setContent(html);
    await page.waitForTimeout(50);

    const { textareaWidth, containerWidth } = await page.evaluate(() => {
      const textarea = document.querySelector("textarea#aiSystemPrompt") as HTMLElement;
      const container = textarea.closest("form") as HTMLElement;
      return { textareaWidth: textarea.getBoundingClientRect().width, containerWidth: container.getBoundingClientRect().width };
    });
    expect(textareaWidth).toBeLessThanOrEqual(containerWidth + 1); // +1 margem de arredondamento de subpixel

    await page.close();
  });
});
