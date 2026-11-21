// Layout real (Playwright, Tailwind compilado) da linha de cada clínica
// em AbordagemPrepView — pedido explícito: o novo botão "Link da Fila"
// não pode estourar a largura da linha (checkbox + nome/@/contador +
// limite diário + "Link da Fila" + "Mensagens", tudo na mesma linha),
// mesmo padrão de teste já usado em ClinicFilaView.layout.test.tsx.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { chromium, type Browser } from "playwright";
import { AbordagemPrepView } from "./AbordagemPrepView";

const PROJECT_ROOT = path.resolve(__dirname, "../../../../..");

const WINDOW = { startMinute: 7 * 60, endMinute: 20 * 60 };
const TIMING = { waitMinMinutes: 1, waitMaxMinutes: 2, batchSize: 30, batchPauseHours: 2 };

// Nome/@ deliberadamente longos — pior caso real pra "estourar" a linha
// junto com o botão novo.
const CLINICS = [
  {
    id: "clinic-1",
    name: "Clínica Odontológica Sorriso Perfeito Ltda",
    igUsername: "clinica.odontologica.sorriso.perfeito",
    dailyLimit: 60,
    activeInQueue: true,
    paused: false,
    hasMessages: true,
    leadsRemaining: 320,
  },
];

const WIDTHS = [360, 390, 414];

describe("AbordagemPrepView — linha da clínica com 'Link da Fila' cabe sem rolar horizontalmente", () => {
  let browser: Browser;
  let html: string;

  beforeAll(async () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), "vexo-abordagem-prep-layout-"));
    const outCssPath = path.join(tmpDir, "compiled.css");
    execFileSync("npx", ["tailwindcss", "-i", "./src/app/globals.css", "-o", outCssPath, "--minify"], { cwd: PROJECT_ROOT, stdio: "pipe" });
    const compiledCss = readFileSync(outCssPath, "utf8");
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

    const element = createElement(AbordagemPrepView, { clinics: CLINICS, window: WINDOW, timing: TIMING });
    const markup = renderToStaticMarkup(element);
    html = `<!DOCTYPE html><html class="dark"><head><meta charset="utf-8"><style>${compiledCss}</style></head><body class="bg-vexo-bg text-vexo-fg antialiased">${markup}</body></html>`;
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
  });

  for (const width of WIDTHS) {
    it(`${width}px: sem rolagem horizontal`, async () => {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      await page.setContent(html);
      await page.waitForTimeout(30);

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth, `scrollWidth (${scrollWidth}) > viewport width (${width})`).toBeLessThanOrEqual(width);

      await page.close();
    });
  }

  it("mostra 'Link da Fila' e 'Mensagens' juntos, na mesma linha", async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
    await page.setContent(html);
    await page.waitForTimeout(30);

    expect(await page.getByRole("button", { name: "Link da Fila" }).isVisible()).toBe(true);
    expect(await page.getByRole("link", { name: "Mensagens" }).isVisible()).toBe(true);

    await page.close();
  });
});
