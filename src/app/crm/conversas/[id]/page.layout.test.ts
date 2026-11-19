// Responsividade (pedido explícito) e densidade compacta da tela de
// conversa nas 2 larguras pedidas (390px celular, 1366px notebook) — mesmo
// padrão de teste real (Playwright, Tailwind compilado) já usado em
// crm/clinicas/[id]/conexoes/page.layout.test.ts.
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { chromium, type Browser } from "playwright";

const PROJECT_ROOT = path.resolve(__dirname, "../../../../..");

vi.mock("../../clinicas/actions", () => ({
  setConversationStatus: vi.fn(async () => {}),
  sendHumanReply: vi.fn(async () => {}),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    conversation: {
      findUnique: vi.fn(async () => ({
        id: "conv-1",
        clinicId: "clinic-1",
        status: "IN_CONVERSATION",
        needsHumanReason: null,
        lead: {
          name: "Maria da Silva Pereira Santos Oliveira",
          igUsername: "maria.silva.pereira.santos.oliveira",
          phone: "11999998888",
        },
        clinic: { name: "Clínica Demo VEXO" },
        appointments: [
          {
            id: "appt-1",
            scheduledAt: new Date("2026-03-10T14:00:00Z"),
            status: "SCHEDULED",
          },
        ],
        messages: Array.from({ length: 8 }).map((_, i) => ({
          id: `msg-${i}`,
          direction: i % 2 === 0 ? "INBOUND" : "OUTBOUND",
          sender: i % 2 === 0 ? "LEAD" : "AI",
          content:
            "Oi, tudo bem? Gostaria de agendar uma avaliação para a próxima semana, de preferência no período da tarde.",
          mediaUrl: null,
          status: "SENT",
          sentAt: new Date(`2026-03-0${(i % 9) + 1}T10:00:00Z`),
          createdAt: new Date(`2026-03-0${(i % 9) + 1}T10:00:00Z`),
        })),
      })),
    },
  },
}));

const MOBILE_WIDTH = 390;
const DESKTOP_WIDTH = 1366;

describe("Conversa — tela compacta, sem rolagem horizontal", () => {
  let browser: Browser;
  let compiledCss: string;
  let html: string;

  beforeAll(async () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), "vexo-conversa-overflow-"));
    const outCssPath = path.join(tmpDir, "compiled.css");
    execFileSync("npx", ["tailwindcss", "-i", "./src/app/globals.css", "-o", outCssPath, "--minify"], {
      cwd: PROJECT_ROOT,
      stdio: "pipe",
    });
    compiledCss = readFileSync(outCssPath, "utf8");
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

    const { default: ConversationDetailPage } = await import("./page");
    const element = await ConversationDetailPage({ params: { id: "conv-1" } });
    const markup = renderToStaticMarkup(createElement("div", null, element));
    // Mesma largura útil real do AppShell (sidebar escondida no celular,
    // <main class="px-4">) — sem isso o teste mediria uma área maior do
    // que a tela de verdade tem no celular.
    html = `<!DOCTYPE html><html class="dark"><head><meta charset="utf-8"><style>${compiledCss}</style></head><body class="bg-vexo-bg text-vexo-fg antialiased"><main class="px-4 py-6 sm:px-8 sm:py-8"><div class="mx-auto max-w-6xl">${markup}</div></main></body></html>`;
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
  });

  for (const width of [MOBILE_WIDTH, DESKTOP_WIDTH]) {
    it(`${width}px: sem rolagem horizontal da página`, async () => {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.setContent(html);
      await page.waitForTimeout(30);

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth, `${width}px: scrollWidth (${scrollWidth}) > clientWidth (${clientWidth})`).toBeLessThanOrEqual(
        clientWidth
      );

      await page.close();
    });

    it(`${width}px: nenhum balão de mensagem estoura a própria caixa`, async () => {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.setContent(html);
      await page.waitForTimeout(30);

      const bubbles = await page.locator("p.italic, p:not(.italic)").all();
      // Verificação mais direta: cada bolha (o container com rounded-block
      // + bg de mensagem) não deixa o próprio conteúdo vazar.
      const bubbleBoxes = await page.locator("div.rounded-block.px-2\\.5").all();
      expect(bubbleBoxes.length).toBeGreaterThan(0);
      for (const bubble of bubbleBoxes) {
        const overflowing = await bubble.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
        expect(overflowing).toBe(false);
      }
      void bubbles;

      await page.close();
    });
  }

  it(`${MOBILE_WIDTH}px: balões de mensagem não ocupam quase a tela inteira (largura máxima compacta)`, async () => {
    const page = await browser.newPage({ viewport: { width: MOBILE_WIDTH, height: 900 } });
    await page.setContent(html);
    await page.waitForTimeout(30);

    const containerWidth = await page
      .locator("div.rounded-block.border-vexo-border.bg-vexo-surface.p-2\\.5")
      .first()
      .evaluate((el) => el.clientWidth);
    const bubbleBox = await page.locator("div.rounded-block.px-2\\.5").first().boundingBox();
    expect(bubbleBox).not.toBeNull();
    // max-w-[65%] do balão — nunca mais que ~70% da área útil da conversa.
    expect(bubbleBox!.width).toBeLessThanOrEqual(containerWidth * 0.7);

    await page.close();
  });

  it(`${DESKTOP_WIDTH}px: cartão do Lead (aside) fica estreito (<= 240px)`, async () => {
    const page = await browser.newPage({ viewport: { width: DESKTOP_WIDTH, height: 900 } });
    await page.setContent(html);
    await page.waitForTimeout(30);

    const asideWidth = await page.getByText("Lead", { exact: true }).locator("..").evaluate((el) => el.clientWidth);
    expect(asideWidth).toBeLessThanOrEqual(240);

    await page.close();
  });
});
