// Teste de layout do menu de prazos (popover "Retorno") — pedido explícito
// (4ª rodada, 2026-10-29): "Os testes de layout devem medir a largura do
// menu e das opções no DOM real e falhar se estiverem em grade."
//
// Por que um browser real (Playwright) em vez de jsdom: jsdom não calcula
// layout de verdade (getBoundingClientRect() sempre retorna zero) — não dá
// pra medir flex-wrap/largura sem um motor de CSS real. E por que CSS
// compilado de verdade (Tailwind CLI contra o tailwind.config.ts e o
// globals.css reais do projeto) em vez de um mockup com classes
// reescritas à mão: foi exatamente um mockup estático que escondeu o bug
// de grade nas 3 rodadas anteriores (ver comentário em RetornoButton.tsx).
//
// Estrutura simulada: reconstrói a árvore real — card (relative, largura
// medida no app rodando de verdade: viewport - 32px de gutter da página,
// ver live-check desta rodada) > painel do popover (classes idênticas às
// de RetornoButton.tsx, incluindo w-[calc(100%-16px)]) > ReturnPeriodOptions
// (o componente real, sem reescrever markup). Larguras 320/375/430 — as
// mesmas pedidas para os screenshots finais.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { chromium, type Browser } from "playwright";
import { ReturnPeriodOptions } from "./RetornoButton";
import { RETURN_PERIOD_OPTIONS } from "@/lib/reactivation";

const PROJECT_ROOT = path.resolve(__dirname, "../..");

function buildPopoverHtml(cardWidthPx: number, compiledCss: string): string {
  const optionsMarkup = renderToStaticMarkup(
    createElement(ReturnPeriodOptions, {
      availablePeriods: [...RETURN_PERIOD_OPTIONS],
      localDays: null,
      onPick: () => {},
    })
  );

  // Painel + card com as MESMAS classes de RetornoButton.tsx/ClientPanelView.tsx
  // (copiadas, não reinventadas) — só assim o teste cobre o container real
  // que causou o bug (largura presa ao botão gatilho / blowout do grid pai).
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>${compiledCss}</style>
<style>body { margin: 0; background: #0b0f17; }</style>
</head>
<body>
  <div style="width:${cardWidthPx}px" class="relative flex w-full items-center rounded-lg border border-vexo-border bg-vexo-surface p-[8px]">
    <div class="absolute left-[8px] top-full z-50 mt-[6px] w-[calc(100%-16px)] rounded-xl border border-vexo-border bg-vexo-surface2 p-[8px] shadow-card sm:left-auto sm:right-0 sm:w-[200px] sm:p-2.5" data-testid="popover-panel">
      ${optionsMarkup}
    </div>
  </div>
</body>
</html>`;
}

describe("ReturnPeriodOptions — layout real (320/375/430px)", () => {
  let compiledCss: string;
  let browser: Browser;
  let tmpDir: string;

  beforeAll(async () => {
    // CSS compilado DE VERDADE pelo Tailwind CLI do projeto (mesmo
    // tailwind.config.ts / globals.css do app), não copiado à mão.
    tmpDir = mkdtempSync(path.join(tmpdir(), "vexo-layout-test-"));
    const outCssPath = path.join(tmpDir, "compiled.css");
    execFileSync(
      "npx",
      ["tailwindcss", "-i", "./src/app/globals.css", "-o", outCssPath, "--minify"],
      { cwd: PROJECT_ROOT, stdio: "pipe" }
    );
    compiledCss = require("node:fs").readFileSync(outCssPath, "utf8");

    browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium",
    });
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  async function measure(viewportWidth: number) {
    // Mesmo gutter de página medido no app real rodando (320→288,
    // 375→343, 430→398 — viewport - 32px, consistente nas 3 larguras).
    const cardWidth = viewportWidth - 32;
    const html = buildPopoverHtml(cardWidth, compiledCss);

    const page = await browser.newPage({ viewport: { width: viewportWidth, height: 900 } });
    await page.setContent(html);

    const panel = page.locator('[data-testid="popover-panel"]');
    const panelBox = await panel.boundingBox();
    if (!panelBox) throw new Error("popover panel not found in DOM");

    const buttons = panel.locator("button");
    const count = await buttons.count();
    const boxes = [];
    for (let i = 0; i < count; i++) {
      const box = await buttons.nth(i).boundingBox();
      if (box) boxes.push(box);
    }
    await page.close();

    // Todos os botões são de prazo agora (RETURN_PERIOD_OPTIONS — removida
    // a opção "Sem retorno", que antes era um botão extra full-width).
    const periodBoxes = boxes.slice(0, RETURN_PERIOD_OPTIONS.length);
    const rowYs = [...new Set(periodBoxes.map((b) => Math.round(b.y)))].sort((a, b) => a - b);
    const rows = rowYs.map((y) => periodBoxes.filter((b) => Math.round(b.y) === y));

    return { cardWidth, panelWidth: panelBox.width, periodBoxes, rows };
  }

  it("375px: menu ocupa a largura do card (não presa ao botão gatilho, ~220px)", async () => {
    const { cardWidth, panelWidth } = await measure(375);
    // Bug original: painel media ~220px fixo, preso ao botão. Com a
    // correção, deve acompanhar a largura do CARD (w-[calc(100%-16px)]).
    expect(panelWidth).toBeGreaterThan(cardWidth * 0.85);
  });

  it("375px: os 9 prazos ficam numa linha só (não em grade/3 colunas)", async () => {
    const { rows } = await measure(375);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveLength(RETURN_PERIOD_OPTIONS.length);
  });

  it("430px: os 9 prazos ficam numa linha só", async () => {
    const { rows } = await measure(430);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveLength(RETURN_PERIOD_OPTIONS.length);
  });

  // Pedido explícito (rodada em que "Sem retorno" foi removida): os 9
  // prazos NUNCA quebram, em NENHUMA largura suportada — antes, 320px era
  // tolerado quebrar em 2 linhas (o "Sem retorno" servia de reforço
  // embaixo); sem min-w por botão (removido, ver ReturnPeriodOptions),
  // flex-1 sozinho divide o espaço disponível em 9 partes iguais, sempre
  // numa linha só.
  it("320px: os 9 prazos ficam numa linha só (sem quebrar — não há mais 'Sem retorno' de reforço embaixo)", async () => {
    const { rows } = await measure(320);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveLength(RETURN_PERIOD_OPTIONS.length);
  });

  it("320/375/430px: nenhum botão de prazo fica mais largo que o próximo card de métrica (sem esticar demais numa linha sobrando)", async () => {
    for (const w of [320, 375, 430]) {
      const { periodBoxes } = await measure(w);
      for (const box of periodBoxes) {
        expect(box.width).toBeLessThanOrEqual(90);
      }
    }
  });
});
