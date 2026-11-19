// Responsividade (pedido explícito) do Pipeline nas 2 larguras pedidas
// (390px celular, 1366px notebook) — mesmo padrão de teste real
// (Playwright, Tailwind compilado) já usado em
// conexoes/page.layout.test.ts. O board em si (PipelineBoard.tsx) virou
// Client Component com polling (ver pipeline-polling.ts) — este teste só
// cobre a RENDERIZAÇÃO INICIAL (o HTML que o SSR manda, antes de qualquer
// fetch do polling rodar), que é o que decide overflow/rolagem horizontal.
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { chromium, type Browser } from "playwright";

const PROJECT_ROOT = path.resolve(__dirname, "../../../../..");

// Mutável pelo próprio teste (ver describe "Revisor" abaixo) — var (não
// let/const) pro vi.mock hoisted enxergar a reatribuição feita depois.
// eslint-disable-next-line no-var
var mockSessionRole = "INTERNAL_ADMIN";

vi.mock("@/lib/session", () => ({
  requireInternalOrReviewerSession: vi.fn(async () => ({ user: { role: mockSessionRole, clinicId: "clinic-1" } })),
}));

function makeConversation(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: `conv-${Math.random()}`,
    status: "NEW",
    lastMessageAt: new Date("2026-03-10T10:00:00Z"),
    lead: {
      name: "Maria da Silva Pereira Santos Oliveira",
      igUsername: "maria.silva.pereira.santos.oliveira",
      profilePictureUrl: null,
    },
    appointments: [],
    ...overrides,
  };
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clinic: {
      findUnique: vi.fn(async () => ({ name: "Clínica Demo VEXO" })),
    },
    conversation: {
      findMany: vi.fn(async () => [
        makeConversation({ status: "NEW" }),
        makeConversation({ status: "IN_CONVERSATION" }),
        makeConversation({
          status: "SCHEDULED",
          appointments: [{ scheduledAt: new Date("2026-03-15T14:00:00Z") }],
        }),
        makeConversation({ status: "FOLLOW_UP" }),
        makeConversation({ status: "NEEDS_HUMAN" }),
        makeConversation({ status: "LOST" }),
      ]),
      count: vi.fn(async () => 3),
    },
    appointment: {
      count: vi.fn(async () => 2),
    },
  },
}));

const MOBILE_WIDTH = 390;
const DESKTOP_WIDTH = 1366;

describe("Pipeline — 6 colunas, sem rolagem horizontal da PÁGINA (a do board é própria/esperada)", () => {
  let browser: Browser;
  let compiledCss: string;
  let html: string;

  beforeAll(async () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), "vexo-pipeline-overflow-"));
    const outCssPath = path.join(tmpDir, "compiled.css");
    execFileSync("npx", ["tailwindcss", "-i", "./src/app/globals.css", "-o", outCssPath, "--minify"], {
      cwd: PROJECT_ROOT,
      stdio: "pipe",
    });
    compiledCss = readFileSync(outCssPath, "utf8");
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

    const { default: ClinicPipelinePage } = await import("./page");
    const element = await ClinicPipelinePage({ params: { id: "clinic-1" } });
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
    it(`${width}px: sem rolagem horizontal da PÁGINA (document.documentElement)`, async () => {
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
  }

  it("renderiza as 6 colunas e os 6 leads (um em cada status)", async () => {
    const page = await browser.newPage({ viewport: { width: DESKTOP_WIDTH, height: 900 } });
    await page.setContent(html);
    await page.waitForTimeout(30);

    for (const label of ["Novo contato", "Em conversa", "Agendado", "Follow-up", "Precisa de humano", "Perdido"]) {
      expect(await page.locator("h2", { hasText: label }).count()).toBe(1);
    }

    await page.close();
  });
});

// Requisito do App Review da Meta: Pipeline sob o login Revisor — mesmo
// board (já era 100% somente leitura, sem botão de ação nenhum) e sem
// rolagem horizontal da página, nas 2 larguras pedidas.
describe("Pipeline — Revisor (mesmo board, somente leitura)", () => {
  let browser: Browser;
  let compiledCss: string;
  let html: string;

  beforeAll(async () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), "vexo-pipeline-revisor-"));
    const outCssPath = path.join(tmpDir, "compiled.css");
    execFileSync("npx", ["tailwindcss", "-i", "./src/app/globals.css", "-o", outCssPath, "--minify"], {
      cwd: PROJECT_ROOT,
      stdio: "pipe",
    });
    compiledCss = readFileSync(outCssPath, "utf8");
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

    mockSessionRole = "REVIEWER";
    const { default: ClinicPipelinePage } = await import("./page");
    const element = await ClinicPipelinePage({ params: { id: "clinic-1" } });
    const markup = renderToStaticMarkup(createElement("div", null, element));
    html = `<!DOCTYPE html><html class="dark"><head><meta charset="utf-8"><style>${compiledCss}</style></head><body class="bg-vexo-bg text-vexo-fg antialiased"><main class="px-4 py-6 sm:px-8 sm:py-8"><div class="mx-auto max-w-6xl">${markup}</div></main></body></html>`;
  }, 60_000);

  afterAll(async () => {
    mockSessionRole = "INTERNAL_ADMIN";
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
  }
});
