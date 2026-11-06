// Teste de cor do guia "Bônus Full Face" — pedido explícito (rodada mais
// recente): trocar a paleta própria da aba pelos tokens globais do VEXO
// (--vexo-*, ver src/app/globals.css), com um único acento (o azul do
// VEXO) no lugar do teal/verde que a aba usava antes, e o bloco "Ideia
// central" mantido com o âmbar fixo (destaque semântico, fora da troca).
//
// A prova mais forte de que a aba REALMENTE usa os tokens globais (e não
// só reproduziu os mesmos valores por coincidência) é trocar o valor de
// --vexo-accent/--vexo-surface no :root e confirmar que a cor renderizada
// do guia muda junto — é isso que os testes "segue a troca de..." fazem.
//
// Por que um browser real (Playwright) em vez de ler o CSS como texto:
// :global(...) (postcss-modules) não é CSS padrão — um browser real,
// carregando o arquivo (com :global() desembrulhado, mesma técnica já
// usada neste repo pra este arquivo) é o jeito confiável de confirmar o
// que cada token realmente resolve visualmente.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser } from "playwright";

const CSS_PATH = path.join(__dirname, "FullFaceBonusGuide.module.css");

// Valores PADRÃO do VEXO (src/app/globals.css) — "R G B" sem vírgula,
// igual ao formato real das variáveis.
const DEFAULT_VEXO_ROOT = `
  --vexo-bg: 11 15 23;
  --vexo-surface: 20 26 36;
  --vexo-surface2: 27 34 46;
  --vexo-border: 35 44 58;
  --vexo-border-strong: 51 64 79;
  --vexo-muted: 139 150 168;
  --vexo-fg: 241 244 248;
  --vexo-accent: 59 130 246;
  --vexo-accent-fg: 255 255 255;
  --vexo-petrol: 11 36 54;
  --vexo-petrol-border: 30 68 89;
`;

const VEXO_SURFACE = "rgb(20, 26, 36)";
const VEXO_SURFACE2 = "rgb(27, 34, 46)";
const VEXO_MUTED = "rgb(139, 150, 168)";
const VEXO_ACCENT = "rgb(59, 130, 246)"; // azul
const OLD_TEAL = "rgb(94, 194, 181)"; // acento antigo da aba (não deve mais aparecer)

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
    <div class="idea" id="idea">
      <p class="ideaLabel" id="ideaLabel">Ideia central</p>
    </div>
    <div class="phrase" id="phrase">
      <p class="phraseLabel" id="phraseLabel">Frase para usar</p>
      <p class="phraseText" id="phraseText">texto da frase</p>
    </div>
  </div>
</div>`;

async function renderWithRoot(browser: Browser, compiledCss: string, rootVars: string) {
  const page = await browser.newPage();
  await page.setContent(
    `<!DOCTYPE html><html class="dark"><head><meta charset="utf-8"><style>:root{${rootVars}}</style><style>${compiledCss}</style></head><body>${markup}</body></html>`
  );
  await page.waitForTimeout(100);
  return page;
}

describe("FullFaceBonusGuide — paleta mapeada pros tokens globais do VEXO", () => {
  let browser: Browser;
  let compiledCss: string;

  beforeAll(async () => {
    const rawCss = readFileSync(CSS_PATH, "utf8");
    compiledCss = rawCss.replace(/:global\(([^)]+)\)/g, "$1");
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
  });

  async function colorOf(page: Awaited<ReturnType<typeof renderWithRoot>>, selector: string, prop: string) {
    return page.$eval(selector, (el, p) => getComputedStyle(el)[p as keyof CSSStyleDeclaration] as string, prop);
  }

  it("com os tokens PADRÃO do VEXO: superfícies em --vexo-surface/--vexo-surface2 (não mais a paleta própria antiga)", async () => {
    const page = await renderWithRoot(browser, compiledCss, DEFAULT_VEXO_ROOT);
    expect(await colorOf(page, "#activeItem", "backgroundColor")).toBe(VEXO_SURFACE2);
    expect(await colorOf(page, "#phrase", "backgroundColor")).toBe(VEXO_SURFACE2);
    await page.close();
  });

  it("com os tokens PADRÃO do VEXO: acento único é o azul (--vexo-accent) — nada mais usa o teal antigo", async () => {
    const page = await renderWithRoot(browser, compiledCss, DEFAULT_VEXO_ROOT);
    const circleBg = await colorOf(page, "#activeItem .circle", "backgroundColor");
    const phraseBorder = await colorOf(page, "#phrase", "borderLeftColor");
    expect(circleBg).toBe(VEXO_ACCENT);
    expect(phraseBorder).toBe(VEXO_ACCENT);
    expect(circleBg).not.toBe(OLD_TEAL);
    expect(phraseBorder).not.toBe(OLD_TEAL);
    await page.close();
  });

  it("passo selecionado no menu: sem contorno (box-shadow none) — só o número carrega o acento", async () => {
    const page = await renderWithRoot(browser, compiledCss, DEFAULT_VEXO_ROOT);
    expect(await colorOf(page, "#activeItem", "boxShadow")).toBe("none");
    await page.close();
  });

  it("'PASSO 2 DE 7' e 'FRASE PARA USAR': cinza-azulado discreto (--vexo-muted), não o acento", async () => {
    const page = await renderWithRoot(browser, compiledCss, DEFAULT_VEXO_ROOT);
    expect(await colorOf(page, "#eyebrow", "color")).toBe(VEXO_MUTED);
    expect(await colorOf(page, "#phraseLabel", "color")).toBe(VEXO_MUTED);
    await page.close();
  });

  it("bloco 'Ideia central' mantido fora da troca: não usa o azul nem os tokens de superfície globais", async () => {
    const page = await renderWithRoot(browser, compiledCss, DEFAULT_VEXO_ROOT);
    const ideaBg = await colorOf(page, "#idea", "backgroundColor");
    const ideaLabelColor = await colorOf(page, "#ideaLabel", "color");
    expect(ideaBg).not.toBe(VEXO_SURFACE2);
    expect(ideaBg).not.toBe(VEXO_ACCENT);
    expect(ideaLabelColor).not.toBe(VEXO_ACCENT);
    expect(ideaLabelColor).not.toBe(VEXO_MUTED);
    await page.close();
  });

  it("prova de vínculo real: trocando --vexo-accent no :root, a cor do guia muda junto (não é um valor fixo duplicado)", async () => {
    const customRoot = DEFAULT_VEXO_ROOT.replace("--vexo-accent: 59 130 246;", "--vexo-accent: 220 38 38;"); // vermelho de teste
    const page = await renderWithRoot(browser, compiledCss, customRoot);
    const circleBg = await colorOf(page, "#activeItem .circle", "backgroundColor");
    expect(circleBg).toBe("rgb(220, 38, 38)");
    expect(circleBg).not.toBe(VEXO_ACCENT);
    await page.close();
  });

  it("prova de vínculo real: trocando --vexo-surface2 no :root, o fundo dos blocos aninhados muda junto", async () => {
    const customRoot = DEFAULT_VEXO_ROOT.replace("--vexo-surface2: 27 34 46;", "--vexo-surface2: 10 50 10;"); // verde de teste
    const page = await renderWithRoot(browser, compiledCss, customRoot);
    const phraseBg = await colorOf(page, "#phrase", "backgroundColor");
    expect(phraseBg).toBe("rgb(10, 50, 10)");
    expect(phraseBg).not.toBe(VEXO_SURFACE2);
    await page.close();
  });
});
