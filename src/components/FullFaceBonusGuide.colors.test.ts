// Teste de cor do guia "Bônus Full Face" — pedido explícito: menos teal
// na tela (hoje aparecia demais na borda+número do passo selecionado, no
// rótulo "PASSO X DE Y", no rótulo "FRASE PARA USAR" e no fundo desse
// bloco). Depois do ajuste, o único acento de teal que deve sobrar aqui é
// o número do passo selecionado (.circle) e a linha fina da lateral do
// bloco "Frase para usar".
//
// Por que um browser real (Playwright) em vez de ler o CSS como texto:
// :global(...) (postcss-modules) não é CSS padrão — um browser real,
// carregando o arquivo (com :global() desembrulhado, mesma técnica já
// usada neste repo pra este arquivo) é o jeito confiável de confirmar o
// que cada token realmente resolve visualmente no tema escuro (único
// tema que o VEXO usa em produção — ver comentário em
// FullFaceBonusGuide.module.css).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";

const CSS_PATH = path.join(__dirname, "FullFaceBonusGuide.module.css");

const TEAL_DARK = "rgb(94, 194, 181)"; // --green no tema escuro
const MUTED_DARK = "rgb(148, 168, 164)"; // --muted no tema escuro
const CARD_DARK = "rgb(22, 35, 33)"; // --card no tema escuro

const markup = `
<div class="scope">
  <div class="side">
    <button class="sideItem sideItemActive" id="activeItem">
      <span class="circle">2</span>
      <span class="sideTitle">Passo 2</span>
    </button>
  </div>
  <div>
    <p class="eyebrow" id="eyebrow">Passo 2 de 7</p>
    <div class="phrase" id="phrase">
      <p class="phraseLabel" id="phraseLabel">Frase para usar</p>
      <p class="phraseText" id="phraseText">texto da frase</p>
    </div>
  </div>
</div>`;

describe("FullFaceBonusGuide — menos teal (item 2)", () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    const rawCss = readFileSync(CSS_PATH, "utf8");
    const compiledCss = rawCss.replace(/:global\(([^)]+)\)/g, "$1");
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
    page = await browser.newPage();
    await page.setContent(
      `<!DOCTYPE html><html class="dark"><head><meta charset="utf-8"><style>${compiledCss}</style></head><body>${markup}</body></html>`
    );
    await page.waitForTimeout(100);
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
  });

  async function colorOf(selector: string, prop: string) {
    return page.$eval(selector, (el, p) => getComputedStyle(el)[p as keyof CSSStyleDeclaration] as string, prop);
  }

  it("passo selecionado no menu: sem contorno teal (box-shadow none) e fundo neutro (igual aos cards)", async () => {
    const boxShadow = await colorOf("#activeItem", "boxShadow");
    const background = await colorOf("#activeItem", "backgroundColor");
    expect(boxShadow).toBe("none");
    expect(background).toBe(CARD_DARK);
  });

  it("número do passo selecionado continua teal (único acento mantido no menu)", async () => {
    const circleBg = await colorOf("#activeItem .circle", "backgroundColor");
    expect(circleBg).toBe(TEAL_DARK);
  });

  it("'PASSO 2 DE 7' (eyebrow): cinza-azulado discreto, não teal", async () => {
    const color = await colorOf("#eyebrow", "color");
    expect(color).toBe(MUTED_DARK);
    expect(color).not.toBe(TEAL_DARK);
  });

  it("bloco 'FRASE PARA USAR': fundo neutro igual aos outros cards, com só uma linha fina de teal na lateral", async () => {
    const background = await colorOf("#phrase", "backgroundColor");
    const borderLeftColor = await colorOf("#phrase", "borderLeftColor");
    const borderLeftWidth = await colorOf("#phrase", "borderLeftWidth");
    expect(background).toBe(CARD_DARK);
    expect(borderLeftColor).toBe(TEAL_DARK);
    expect(borderLeftWidth).toBe("2px");
  });

  it("texto do bloco 'Frase para usar' em tom claro neutro (não mais o teal/mint antigo)", async () => {
    const color = await colorOf("#phraseText", "color");
    expect(color).not.toBe(TEAL_DARK);
  });

  it("rótulo 'FRASE PARA USAR': cinza-azulado discreto, não teal", async () => {
    const color = await colorOf("#phraseLabel", "color");
    expect(color).toBe(MUTED_DARK);
  });
});
