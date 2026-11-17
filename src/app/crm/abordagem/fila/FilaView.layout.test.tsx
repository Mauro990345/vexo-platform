// Layout real (Playwright, Tailwind compilado) do novo card horizontal da
// Fila de abordagem (ver DESIGN.md "rodada 8") — pedido explícito: os 5
// cards (o máximo da tela) cabem na PRIMEIRA tela de um iPhone comum, sem
// precisar rolar. Mesmo padrão de teste já usado em
// automacoes/page.layout.test.ts e crm/(global)/page.layout.test.ts.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { chromium, type Browser } from "playwright";
import { FilaView } from "./FilaView";
import type { ApproachBoardAccount } from "@/lib/approach-queue-db";

const PROJECT_ROOT = path.resolve(__dirname, "../../../../..");

// Janela sempre aberta (0h-23h59) — evita que o teste dependa do horário
// real em que ele é executado (mesmo truque já usado em
// approach-queue-db.test.ts, "janela customizada mais ampla").
const ALWAYS_OPEN_WINDOW = { startMinute: 0, endMinute: 23 * 60 + 59 };

function buildAccount(id: string, overrides: Partial<ApproachBoardAccount> = {}): ApproachBoardAccount {
  return {
    clinicId: id,
    name: `Clínica ${id}`,
    igUsername: `clinica.${id}`,
    profilePictureUrl: null,
    dailyLimit: 60,
    sentToday: 3,
    leadsRemaining: 320,
    state: { kind: "READY" },
    items: [{ id: `item-${id}`, username: `lead.${id}`, name: null, message: "Oi!", dmLink: `https://ig.me/m/lead.${id}` }],
    ...overrides,
  };
}

// 5 clínicas, estados variados (igual ao que a ordem do servidor devolveria:
// liberadas primeiro) — pra também cobrir visualmente os textos mais
// longos de botão ("Fora do horário"/"Pausa h:mm:ss").
const FIVE_ACCOUNTS: ApproachBoardAccount[] = [
  buildAccount("a", { state: { kind: "READY" } }),
  buildAccount("b", { state: { kind: "READY" }, name: "Clínica com Nome Bem Longo Pra Testar Truncamento Real" }),
  buildAccount("c", { state: { kind: "WAITING", msRemaining: 72_000 } }),
  buildAccount("d", { state: { kind: "BATCH_PAUSED", msRemaining: 2 * 3600_000 + 48 * 60_000 } }),
  buildAccount("e", { state: { kind: "LIMIT_REACHED" } }),
];

// Larguras/alturas de iPhones comuns ainda em uso (CSS px) — SE (menor
// tela corrente), 12/13/14 e 14 Pro Max (maior tela corrente).
const IPHONE_VIEWPORTS = [
  { label: "iPhone SE", width: 375, height: 667 },
  { label: "iPhone 12/13/14", width: 390, height: 844 },
  { label: "iPhone 14 Pro Max", width: 430, height: 932 },
];

describe("FilaView — 5 cards cabem na 1ª tela de um iPhone comum, sem rolar", () => {
  let browser: Browser;
  let html: string;

  beforeAll(async () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), "vexo-fila-layout-"));
    const outCssPath = path.join(tmpDir, "compiled.css");
    execFileSync("npx", ["tailwindcss", "-i", "./src/app/globals.css", "-o", outCssPath, "--minify"], { cwd: PROJECT_ROOT, stdio: "pipe" });
    const compiledCss = readFileSync(outCssPath, "utf8");
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

    const element = createElement(FilaView, { initialAccounts: FIVE_ACCOUNTS, initialWindow: ALWAYS_OPEN_WINDOW });
    const markup = renderToStaticMarkup(element);
    html = `<!DOCTYPE html><html class="dark"><head><meta charset="utf-8"><style>${compiledCss}</style></head><body class="bg-vexo-bg text-vexo-fg antialiased">${markup}</body></html>`;
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
  });

  for (const { label, width, height } of IPHONE_VIEWPORTS) {
    it(`${label} (${width}x${height}): os 5 cards cabem na tela sem rolar verticalmente`, async () => {
      const page = await browser.newPage({ viewport: { width, height } });
      await page.setContent(html);
      await page.waitForTimeout(30);

      const cardCount = await page.locator("[data-clinic-queue-card]").count();
      expect(cardCount).toBe(5);

      const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      expect(scrollHeight, `${label}: scrollHeight (${scrollHeight}) > viewport height (${height})`).toBeLessThanOrEqual(height);

      await page.close();
    });

    it(`${label}: sem rolagem horizontal`, async () => {
      const page = await browser.newPage({ viewport: { width, height } });
      await page.setContent(html);
      await page.waitForTimeout(30);

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(width);

      await page.close();
    });
  }

  it("nome de clínica longo trunca (1 linha) sem empurrar o botão 'Enviar' pra fora do card", async () => {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
    await page.setContent(html);
    await page.waitForTimeout(30);

    const longCard = page.locator("[data-clinic-queue-card]", { hasText: "Clínica com Nome Bem Longo" });
    const nameBox = await longCard.getByText("Clínica com Nome Bem Longo", { exact: false }).boundingBox();
    const sendButtonBox = await longCard.getByRole("button", { name: "Enviar" }).boundingBox();

    expect(nameBox).not.toBeNull();
    expect(sendButtonBox).not.toBeNull();
    // O nome (truncado) termina antes do botão começar — nunca sobrepõe.
    expect(nameBox!.x + nameBox!.width).toBeLessThanOrEqual(sendButtonBox!.x + 1);
    // O card continua dentro da largura da tela (o texto não "estourou").
    const cardBox = await longCard.boundingBox();
    expect(cardBox!.x + cardBox!.width).toBeLessThanOrEqual(375);

    await page.close();
  });

  it("botão liberado tem pelo menos 44px de altura TOCÁVEL (área de toque ampliada), mesmo com o desenho visual menor", async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent(html);
    await page.waitForTimeout(30);

    const sendButton = page.getByRole("button", { name: "Enviar" }).first();
    const tapHeight = await sendButton.evaluate((el) => {
      const before = getComputedStyle(el, "::before");
      return parseFloat(before.height || "0");
    });
    expect(tapHeight).toBeGreaterThanOrEqual(44);

    await page.close();
  });
});
