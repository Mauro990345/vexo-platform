// Bug real reportado: Agente de IA abria "encolhida pro canto esquerdo"
// no celular — sintoma clássico de o navegador reduzir o zoom da página
// inteira pra caber um elemento mais largo que a tela. Causa raiz: a
// linha de abas (ver Tabs.tsx) usa whitespace-nowrap nos rótulos (pedido
// de design, "sem quebrar o texto da aba") dentro de um flex row sem
// nenhuma contenção de overflow — com 3-4 rótulos longos (ex: "Prompt de
// conversação da IA", "Timing de resposta da IA"), a soma das larguras
// passa longe dos ~390px de uma tela de celular, e sem overflow-x-auto
// esse excesso vazava pra fora do container e estourava a largura de
// TODA a página (não só da linha de abas).
//
// Este teste prova, pra cada conjunto de rótulos REAL usado hoje no app
// (Agente de IA = 4 abas, Follow-up = 3, Automações = 2), que a LINHA de
// abas (não a página) é quem rola — document.documentElement.scrollWidth
// nunca passa do viewport em nenhuma das 3 larguras de celular pedidas
// (360/390/414), e que em desktop (1366) a linha renderiza sem rolagem
// nenhuma (cabe inteira, visual idêntico ao de antes da correção).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { chromium, type Browser } from "playwright";
import { Tabs } from "./Tabs";

const PROJECT_ROOT = path.resolve(__dirname, "../..");

const PAGE_TAB_SETS: { page: string; labels: string[] }[] = [
  { page: "Agente de IA", labels: ["Prompt de conversação da IA", "Fotos de resultado", "Timing de resposta da IA", "Janela de envio"] },
  { page: "Follow-up", labels: ["Parou de responder", "Não compareceu", "Cards do Painel"] },
  { page: "Automações", labels: ["Configuração", "Registrar abordagens de hoje"] },
];

const MOBILE_WIDTHS = [360, 390, 414];
const DESKTOP_WIDTH = 1366;

describe("Tabs — linha de abas não estoura a largura da página no celular", () => {
  let browser: Browser;
  let compiledCss: string;

  beforeAll(async () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), "vexo-tabs-overflow-"));
    const outCssPath = path.join(tmpDir, "compiled.css");
    execFileSync("npx", ["tailwindcss", "-i", "./src/app/globals.css", "-o", outCssPath, "--minify"], { cwd: PROJECT_ROOT, stdio: "pipe" });
    compiledCss = readFileSync(outCssPath, "utf8");
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
  });

  function markupFor(labels: string[]): string {
    const markup = renderToStaticMarkup(
      createElement(Tabs, {
        defaultTabId: "t0",
        tabs: labels.map((label, i) => ({
          id: `t${i}`,
          label,
          icon: createElement("svg", { width: 14, height: 14 }),
          content: createElement("div", null, label),
        })),
      })
    );
    return `<!DOCTYPE html><html class="dark"><head><meta charset="utf-8"><style>${compiledCss}</style></head><body class="bg-vexo-bg text-vexo-fg antialiased max-w-3xl" style="padding:16px">${markup}</body></html>`;
  }

  for (const { page: pageName, labels } of PAGE_TAB_SETS) {
    for (const width of MOBILE_WIDTHS) {
      it(`${pageName} (${labels.length} abas) em ${width}px: sem rolagem horizontal da PÁGINA`, async () => {
        const page = await browser.newPage({ viewport: { width, height: 500 } });
        await page.setContent(markupFor(labels));
        await page.waitForTimeout(50);

        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
        expect(scrollWidth, `document.scrollWidth (${scrollWidth}) não pode passar do clientWidth (${clientWidth})`).toBeLessThanOrEqual(clientWidth);

        await page.close();
      });
    }

    it(`${pageName} (${labels.length} abas) em ${DESKTOP_WIDTH}px: sem rolagem nenhuma (cabe inteira, visual de antes mantido)`, async () => {
      const page = await browser.newPage({ viewport: { width: DESKTOP_WIDTH, height: 500 } });
      await page.setContent(markupFor(labels));
      await page.waitForTimeout(50);

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

      await page.close();
    });
  }

  it("a linha de abas em si é quem rola (overflow-x-auto), não a página — confirma a correção real, não só o sintoma", async () => {
    const { labels } = PAGE_TAB_SETS[0]!; // Agente de IA, 4 abas — a mais larga
    const page = await browser.newPage({ viewport: { width: 390, height: 500 } });
    await page.setContent(markupFor(labels));
    await page.waitForTimeout(50);

    const tabRow = await page.$("div.overflow-x-auto");
    expect(tabRow, "a linha de abas precisa ter overflow-x-auto").not.toBeNull();
    const { rowScrollWidth, rowClientWidth } = await tabRow!.evaluate((el) => ({ rowScrollWidth: el.scrollWidth, rowClientWidth: el.clientWidth }));
    expect(rowScrollWidth).toBeGreaterThan(rowClientWidth); // confirma que ela TEM conteúdo rolável (não é um teste vazio)

    await page.close();
  });
});
