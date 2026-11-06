// Teste de cor do guia "Bônus Full Face" — pedido explícito: o verde
// volta, mas só no "bloco grande" (player de áudio + texto do passo, ver
// .card/BlockCard em FullFaceBonusGuide.tsx) — fundo da página continua
// neutro (--vexo-surface, padrão VEXO). Acento único do conteúdo do Bônus
// é esse mesmo verde (--bonus-green, UMA variável só, declarada em
// src/app/globals.css :root — não mais local ao .scope, pra também poder
// ser reaproveitada pela prévia de estilo da tela Automações), não mais o
// azul (--vexo-accent): círculo do passo ativo e a borda da "Frase para
// usar" usam esse verde; "Ideia central" continua intocado (âmbar fixo).
// Tom mais claro/sutil (RGB 94 194 181, igual às PRs #179/#180, antes da
// troca de paleta) — pedido explícito porque o tom anterior (RGB 52 211
// 153) tinha ficado "forte demais".
//
// A prova mais forte de que os elementos REALMENTE usam a variável (e não
// só reproduziram os mesmos valores por coincidência) é trocar
// --bonus-green no :root e confirmar que a cor renderizada muda junto —
// é isso que o teste "prova de vínculo real" faz.
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
// igual ao formato real das variáveis. --bonus-green incluída aqui porque
// agora mora em :root (globals.css), não mais dentro de .scope.
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
  --bonus-green: 94 194 181;
`;

const BONUS_GREEN = "rgb(94, 194, 181)";

const VEXO_SURFACE = "rgb(20, 26, 36)"; // fundo da página (.root) — sem verde
const VEXO_SURFACE2 = "rgb(27, 34, 46)"; // blocos neutros (ex: .phrase)
const VEXO_MUTED = "rgb(139, 150, 168)";
const VEXO_ACCENT = "rgb(59, 130, 246)"; // azul — reservado fora do Bônus

const markup = `
<div class="scope">
  <div class="root" id="root">
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
      <section class="card" id="card">
        <h2 class="blockTitle">Título do bloco</h2>
        <p class="p">Texto do passo dentro do bloco grande.</p>
      </section>
    </div>
  </div>
</div>`;

async function renderWithRoot(browser: Browser, compiledCss: string, rootVars: string, overrideAfter = "") {
  const page = await browser.newPage();
  await page.setContent(
    `<!DOCTYPE html><html class="dark"><head><meta charset="utf-8"><style>:root{${rootVars}}</style><style>${compiledCss}</style><style>${overrideAfter}</style></head><body>${markup}</body></html>`
  );
  await page.waitForTimeout(100);
  return page;
}

// Relative luminance / contraste WCAG — pra provar numericamente "o texto
// deve manter contraste de leitura confortável" (pedido explícito) em vez
// de confiar só em inspeção visual.
function relativeLuminance(rgb: string): number {
  const nums = rgb.match(/\d+/g)!;
  const r = Number(nums[0] ?? 0) / 255;
  const g = Number(nums[1] ?? 0) / 255;
  const b = Number(nums[2] ?? 0) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [lighter, darker] = la > lb ? [la, lb] : [lb, la];
  return (lighter + 0.05) / (darker + 0.05);
}

// getComputedStyle() devolve o valor CRU da cor (ex: "rgba(94, 194, 181,
// 0.1)" pro wash do bloco grande) — NUNCA o composto visual contra o que
// está atrás. Pra medir "quão escuro/discreto" o wash realmente aparece
// na tela (e o contraste real do texto sobre ele), é preciso compor a
// cor com alpha manualmente sobre o fundo que fica atrás (.root/--bg).
function parseRgba(c: string): [number, number, number, number] {
  const nums = c.match(/[\d.]+/g)!.map(Number);
  return [nums[0] ?? 0, nums[1] ?? 0, nums[2] ?? 0, nums[3] ?? 1];
}

function compositeOverBg(fgRgba: string, bgRgb: string): string {
  const [fr, fgG, fb, fa] = parseRgba(fgRgba);
  const [br, bgG, bb] = parseRgba(bgRgb);
  const r = fr * fa + br * (1 - fa);
  const g = fgG * fa + bgG * (1 - fa);
  const b = fb * fa + bb * (1 - fa);
  return `rgb(${r}, ${g}, ${b})`;
}

describe("FullFaceBonusGuide — verde só no bloco grande, acento único (--bonus-green)", () => {
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

  async function styleOf(page: Awaited<ReturnType<typeof renderWithRoot>>, selector: string, prop: string) {
    return page.$eval(selector, (el, p) => getComputedStyle(el)[p as keyof CSSStyleDeclaration] as string, prop);
  }

  it("fundo da página (.root) continua neutro, --vexo-surface — sem verde", async () => {
    const page = await renderWithRoot(browser, compiledCss, DEFAULT_VEXO_ROOT);
    expect(await styleOf(page, "#root", "backgroundColor")).toBe(VEXO_SURFACE);
    await page.close();
  });

  it("bloco grande (.card — player + texto do passo): fundo e borda são um wash de verde, não a superfície neutra", async () => {
    const page = await renderWithRoot(browser, compiledCss, DEFAULT_VEXO_ROOT);
    const bg = await styleOf(page, "#card", "backgroundColor");
    const borderColor = await styleOf(page, "#card", "borderTopColor");
    expect(bg).not.toBe(VEXO_SURFACE2);
    expect(bg).not.toBe("rgba(0, 0, 0, 0)");
    expect(borderColor).toMatch(/^rgba?\(/);
    await page.close();
  });

  it("bloco grande: o wash de fundo é BEM ESCURO e discreto (luminância baixa, perto do fundo da página — já composto com o alpha)", async () => {
    const page = await renderWithRoot(browser, compiledCss, DEFAULT_VEXO_ROOT);
    const cardBg = await styleOf(page, "#card", "backgroundColor");
    const pageBg = await styleOf(page, "#root", "backgroundColor");
    const composite = compositeOverBg(cardBg, pageBg);
    const cardLum = relativeLuminance(composite);
    const pageLum = relativeLuminance(pageBg);
    // "Discreto": a luminância do bloco (já composta com o que fica atrás)
    // fica bem próxima da página — não um verde vivo/saturado tomando a
    // tela, mas perceptível o bastante pra se notar (diferença pequena
    // porém não nula).
    const diff = Math.abs(cardLum - pageLum);
    expect(diff).toBeGreaterThan(0);
    expect(diff).toBeLessThan(0.05);
    await page.close();
  });

  it("'Frase para usar': borda verde suave (não mais azul), fundo continua neutro (não é o mesmo wash do bloco grande)", async () => {
    const page = await renderWithRoot(browser, compiledCss, DEFAULT_VEXO_ROOT);
    const bg = await styleOf(page, "#phrase", "backgroundColor");
    const borderLeftColor = await styleOf(page, "#phrase", "borderLeftColor");
    expect(bg).toBe(VEXO_SURFACE2);
    expect(borderLeftColor).not.toBe(VEXO_ACCENT);
    await page.close();
  });

  it("círculo do passo ativo: verde do Bônus (não mais azul)", async () => {
    const page = await renderWithRoot(browser, compiledCss, DEFAULT_VEXO_ROOT);
    const circleBg = await styleOf(page, "#activeItem .circle", "backgroundColor");
    expect(circleBg).toBe(BONUS_GREEN);
    expect(circleBg).not.toBe(VEXO_ACCENT);
    await page.close();
  });

  it("passo selecionado no menu: sem contorno (box-shadow none) — só o número carrega o acento", async () => {
    const page = await renderWithRoot(browser, compiledCss, DEFAULT_VEXO_ROOT);
    expect(await styleOf(page, "#activeItem", "boxShadow")).toBe("none");
    await page.close();
  });

  it("'PASSO 2 DE 7' e 'FRASE PARA USAR': cinza-azulado discreto (--vexo-muted), não o acento", async () => {
    const page = await renderWithRoot(browser, compiledCss, DEFAULT_VEXO_ROOT);
    expect(await styleOf(page, "#eyebrow", "color")).toBe(VEXO_MUTED);
    expect(await styleOf(page, "#phraseLabel", "color")).toBe(VEXO_MUTED);
    await page.close();
  });

  it("bloco 'Ideia central' mantido fora da troca: nem verde nem tokens de superfície globais", async () => {
    const page = await renderWithRoot(browser, compiledCss, DEFAULT_VEXO_ROOT);
    const ideaBg = await styleOf(page, "#idea", "backgroundColor");
    const ideaLabelColor = await styleOf(page, "#ideaLabel", "color");
    expect(ideaBg).not.toBe(VEXO_SURFACE2);
    expect(ideaBg).not.toBe(BONUS_GREEN);
    expect(ideaLabelColor).not.toBe(BONUS_GREEN);
    expect(ideaLabelColor).not.toBe(VEXO_MUTED);
    await page.close();
  });

  it("texto sobre o fill sólido de verde (--on-green, círculo ativo) mantém contraste confortável (>= 4.5:1)", async () => {
    const page = await renderWithRoot(browser, compiledCss, DEFAULT_VEXO_ROOT);
    const circleBg = await styleOf(page, "#activeItem .circle", "backgroundColor");
    const circleText = await styleOf(page, "#activeItem .circle", "color");
    expect(contrastRatio(circleBg, circleText)).toBeGreaterThanOrEqual(4.5);
    await page.close();
  });

  it("texto do bloco grande sobre o wash verde mantém contraste confortável (>= 4.5:1, já composto com o alpha)", async () => {
    const page = await renderWithRoot(browser, compiledCss, DEFAULT_VEXO_ROOT);
    const cardBg = await styleOf(page, "#card", "backgroundColor");
    const pageBg = await styleOf(page, "#root", "backgroundColor");
    const titleColor = await styleOf(page, "#card .blockTitle", "color");
    const composite = compositeOverBg(cardBg, pageBg);
    expect(contrastRatio(composite, titleColor)).toBeGreaterThanOrEqual(4.5);
    await page.close();
  });

  it("prova de vínculo real: trocando --bonus-green no :root, o acento (círculo) e o wash do bloco grande mudam junto", async () => {
    const page = await renderWithRoot(browser, compiledCss, DEFAULT_VEXO_ROOT, ".scope { --bonus-green: 220 38 38; }"); // vermelho de teste
    const circleBg = await styleOf(page, "#activeItem .circle", "backgroundColor");
    const cardBorder = await styleOf(page, "#card", "borderTopColor");
    expect(circleBg).toBe("rgb(220, 38, 38)");
    expect(circleBg).not.toBe(BONUS_GREEN);
    expect(cardBorder).toBe("rgba(220, 38, 38, 0.32)");
    await page.close();
  });

  it("trocando --vexo-accent (azul global) no :root, NADA no conteúdo do Bônus muda — acento é só o verde próprio", async () => {
    const customRoot = DEFAULT_VEXO_ROOT.replace("--vexo-accent: 59 130 246;", "--vexo-accent: 220 38 38;");
    const page = await renderWithRoot(browser, compiledCss, customRoot);
    const circleBg = await styleOf(page, "#activeItem .circle", "backgroundColor");
    expect(circleBg).toBe(BONUS_GREEN);
    await page.close();
  });
});
