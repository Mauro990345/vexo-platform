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

// Bug real reportado (rodada seguinte): depois de aumentar a fonte das
// abas (text-xs -> text-sm, pedido explícito de legibilidade), as 4 abas
// de Agente de IA passaram a estourar a largura do CONTAINER da própria
// página (max-w-3xl, 768px) por ~16px — a linha de abas (que tem
// overflow-x-auto) então ganhava uma barra de rolagem horizontal própria
// mesmo em telas de computador largas, o que é feio/inesperado numa tela
// que deveria caber inteira. Correção: alargar o container da página
// (max-w-3xl -> max-w-4xl, só em Agente de IA) em vez de mexer na fonte
// de novo. Este teste reproduz os containers REAIS de cada página (não o
// viewport inteiro) e confirma que a linha de abas NUNCA precisa da
// própria rolagem interna no desktop — só o scroll de segurança pro
// celular (ver suíte acima) continua existindo.
describe("Tabs — a linha de abas cabe inteira (sem rolagem própria) dentro do container real de cada página, no desktop", () => {
  let browser: Browser;
  let compiledCss: string;

  beforeAll(async () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), "vexo-tabs-container-"));
    const outCssPath = path.join(tmpDir, "compiled.css");
    execFileSync("npx", ["tailwindcss", "-i", "./src/app/globals.css", "-o", outCssPath, "--minify"], { cwd: PROJECT_ROOT, stdio: "pipe" });
    compiledCss = readFileSync(outCssPath, "utf8");
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
  });

  function markupInContainer(labels: string[], containerClass: string): string {
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
    return `<!DOCTYPE html><html class="dark"><head><meta charset="utf-8"><style>${compiledCss}</style></head><body class="bg-vexo-bg text-vexo-fg antialiased"><div class="${containerClass}">${markup}</div></body></html>`;
  }

  // Container REAL de cada página hoje (ver <h1>/div pai do Tabs nos
  // respectivos arquivos) — Agente de IA e Automações usam max-w-4xl/
  // max-w-3xl, Follow-up usa max-w-lg.
  const REAL_PAGE_CONTAINERS: { page: string; labels: string[]; containerClass: string }[] = [
    { page: "Agente de IA", labels: PAGE_TAB_SETS[0]!.labels, containerClass: "max-w-4xl" },
    { page: "Follow-up", labels: PAGE_TAB_SETS[1]!.labels, containerClass: "max-w-lg" },
    { page: "Automações", labels: PAGE_TAB_SETS[2]!.labels, containerClass: "max-w-3xl" },
  ];

  for (const { page: pageName, labels, containerClass } of REAL_PAGE_CONTAINERS) {
    it(`${pageName} (container ${containerClass}) em 1366px: a linha de abas cabe sem precisar rolar`, async () => {
      const page = await browser.newPage({ viewport: { width: 1366, height: 500 } });
      await page.setContent(markupInContainer(labels, containerClass));
      await page.waitForTimeout(50);

      const tabRow = await page.$("div.overflow-x-auto");
      const { rowScrollWidth, rowClientWidth } = await tabRow!.evaluate((el) => ({ rowScrollWidth: el.scrollWidth, rowClientWidth: el.clientWidth }));
      expect(
        rowScrollWidth,
        `linha de abas rolável (scrollWidth ${rowScrollWidth} > clientWidth ${rowClientWidth}) — container ${containerClass} está estreito demais pras abas desta página`
      ).toBeLessThanOrEqual(rowClientWidth);

      await page.close();
    });
  }
});
