// Layout real (Playwright, Tailwind compilado) da Fila POR CLÍNICA — pedido
// explícito: os próximos leads empilhados (CLINIC_FILA_STACK_SIZE,
// approach-queue-db.ts) precisam caber na 1ª tela de um iPhone SE sem
// rolar, mesmo orçamento já usado pela Fila global (ver FilaView.layout.test.tsx
// "rodada 7"). Mesmo padrão de teste já usado lá.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { chromium, type Browser } from "playwright";
import { ClinicFilaView } from "./ClinicFilaView";
import type { ApproachBoardAccount, ApproachBoardItem } from "@/lib/approach-queue-db";

const PROJECT_ROOT = path.resolve(__dirname, "../../../../../../..");

const ALWAYS_OPEN_WINDOW = { startMinute: 0, endMinute: 23 * 60 + 59 };

function item(id: string, estimatedMsRemaining?: number): ApproachBoardItem {
  return {
    id,
    username: `lead.${id}`,
    name: id === "item-1" ? null : `Lead ${id}`,
    message: id === "item-1" ? "Oi!" : null,
    dmLink: id === "item-1" ? `https://ig.me/m/lead.${id}` : null,
    estimatedMsRemaining,
  };
}

// 5 itens (CLINIC_FILA_STACK_SIZE) — o 1º é o ativo (READY, botão
// "Enviar"); os outros 4 são prévia esmaecida com estimativa crescente,
// cobrindo também o caso de nome longo (truncamento real).
const ACCOUNT: ApproachBoardAccount = {
  clinicId: "clinic-1",
  name: "Clínica Demo",
  igUsername: "clinica.demo.instagram.account",
  profilePictureUrl: null,
  dailyLimit: 60,
  sentToday: 3,
  leadsRemaining: 42,
  state: { kind: "READY" },
  items: [
    item("item-1"),
    item("item-2", 80_000),
    item("item-3", 170_000),
    item("item-4", 260_000),
    item("item-5", 350_000),
  ],
};

const IPHONE_VIEWPORTS = [
  { label: "iPhone SE", width: 375, height: 667 },
  { label: "iPhone 12/13/14", width: 390, height: 844 },
];

describe("ClinicFilaView — ativo + 4 empilhados cabem na 1ª tela de um iPhone SE, sem rolar", () => {
  let browser: Browser;
  let html: string;

  beforeAll(async () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), "vexo-clinic-fila-layout-"));
    const outCssPath = path.join(tmpDir, "compiled.css");
    execFileSync("npx", ["tailwindcss", "-i", "./src/app/globals.css", "-o", outCssPath, "--minify"], { cwd: PROJECT_ROOT, stdio: "pipe" });
    const compiledCss = readFileSync(outCssPath, "utf8");
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

    const element = createElement(ClinicFilaView, {
      clinicId: "clinic-1",
      clinicName: "Clínica Demo",
      initialAccount: ACCOUNT,
      initialWindow: ALWAYS_OPEN_WINDOW,
    });
    const markup = renderToStaticMarkup(element);
    html = `<!DOCTYPE html><html class="dark"><head><meta charset="utf-8"><style>${compiledCss}</style></head><body class="bg-vexo-bg text-vexo-fg antialiased">${markup}</body></html>`;
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
  });

  for (const { label, width, height } of IPHONE_VIEWPORTS) {
    it(`${label} (${width}x${height}): cabe na tela sem rolar verticalmente`, async () => {
      const page = await browser.newPage({ viewport: { width, height } });
      await page.setContent(html);
      await page.waitForTimeout(30);

      const activeCardCount = await page.locator("[data-clinic-queue-card]").count();
      expect(activeCardCount).toBe(1); // só 1 card com o botão de verdade

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

  it("username conectado longo trunca/não quebra o layout do cabeçalho (sem estourar a largura)", async () => {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
    await page.setContent(html);
    await page.waitForTimeout(30);

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(375);
    await page.close();
  });

  it("só o card ativo tem o botão 'Enviar' — os 4 empilhados não têm nenhum botão clicável", async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent(html);
    await page.waitForTimeout(30);

    const sendButtons = await page.getByRole("button", { name: "Enviar" }).count();
    expect(sendButtons).toBe(1);
    await page.close();
  });
});
