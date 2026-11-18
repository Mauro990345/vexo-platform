// Responsividade (pedido explícito, vídeo de revisão da Meta) da tela de
// Conexões nas 2 larguras pedidas (390px celular, 1366px notebook) — mesmo
// padrão de teste real (Playwright, Tailwind compilado) já usado em
// crm/(global)/page.layout.test.ts.
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { chromium, type Browser } from "playwright";

const PROJECT_ROOT = path.resolve(__dirname, "../../../../../..");

vi.mock("@/lib/session", () => ({
  requireInternalSession: vi.fn(async () => ({ user: { role: "INTERNAL_ADMIN" } })),
}));

vi.mock("@/lib/whatsapp-connection", () => ({
  refreshWhatsappStatus: vi.fn(async () => "close"),
}));

// Só usa router pra re-buscar ao focar a aba (ver RefreshOnFocus.tsx) —
// sem Provider de app router no SSR puro deste teste, useRouter() lança.
// Irrelevante pro que este teste mede (overflow/posição dos cards).
vi.mock("@/components/RefreshOnFocus", () => ({
  RefreshOnFocus: () => null,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clinic: {
      findUnique: vi.fn(async () => ({
        id: "clinic-1",
        name: "Clínica Demo VEXO",
        instagramAccount: null,
        googleCalendarAccount: null,
      })),
    },
    connectionLink: {
      findFirst: vi.fn(async () => null),
    },
    connectionBundle: {
      findFirst: vi.fn(async () => null),
    },
  },
}));

const MOBILE_WIDTH = 390;
const DESKTOP_WIDTH = 1366;

describe("Conexões — 3 cards sempre lado a lado, sem rolagem horizontal", () => {
  let browser: Browser;
  let compiledCss: string;
  let html: string;

  beforeAll(async () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), "vexo-conexoes-overflow-"));
    const outCssPath = path.join(tmpDir, "compiled.css");
    execFileSync("npx", ["tailwindcss", "-i", "./src/app/globals.css", "-o", outCssPath, "--minify"], {
      cwd: PROJECT_ROOT,
      stdio: "pipe",
    });
    compiledCss = readFileSync(outCssPath, "utf8");
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

    const { default: ClinicConexoesPage } = await import("./page");
    const element = await ClinicConexoesPage({ params: { id: "clinic-1" }, searchParams: {} });
    const markup = renderToStaticMarkup(createElement("div", null, element));
    // Mesma largura útil real do AppShell no celular (sidebar escondida,
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

    it(`${width}px: Instagram, Google Calendar e WhatsApp ficam na MESMA linha (nunca empilhados)`, async () => {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.setContent(html);
      await page.waitForTimeout(30);

      // Os próprios cards (não o texto do nome) — robusto a "Google
      // Calendar" quebrar em 2 linhas no celular, o que desalinha o topo
      // do TEXTO sem significar que os CARDS saíram da mesma linha.
      const cardBoxes = await page.locator(".grid.grid-cols-3 > div").evaluateAll((els) =>
        els.map((el) => el.getBoundingClientRect())
      );
      expect(cardBoxes.length).toBe(3);
      const whatsappBox = cardBoxes[0]!;
      const instagramBox = cardBoxes[1]!;
      const googleBox = cardBoxes[2]!;

      // Mesma linha = mesmo topo; lado a lado = x crescente na ordem
      // WhatsApp, Instagram, Google Calendar (ordem real do grid).
      expect(Math.abs(instagramBox.y - whatsappBox.y)).toBeLessThan(1);
      expect(Math.abs(googleBox.y - whatsappBox.y)).toBeLessThan(1);
      expect(whatsappBox.x).toBeLessThan(instagramBox.x);
      expect(instagramBox.x).toBeLessThan(googleBox.x);

      await page.close();
    });

    it(`${width}px: nenhum card estoura a largura da própria coluna do grid (sem corte de texto saindo da caixa)`, async () => {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.setContent(html);
      await page.waitForTimeout(30);

      const cards = await page.locator(".grid.grid-cols-3 > div").all();
      expect(cards.length).toBe(3);
      for (const card of cards) {
        const overflowing = await card.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
        expect(overflowing).toBe(false);
      }

      await page.close();
    });
  }
});
