// Responsividade (pedido explícito) da marca d'água "VEXO" do bloco de
// contato da página pública, nas 3 larguras pedidas (390px celular, 768px
// tablet, 1366px notebook) — mesmo padrão de teste real (Playwright,
// Tailwind compilado) já usado em outras telas (ver
// crm/clinicas/[id]/conexoes/page.layout.test.ts).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { chromium, type Browser } from "playwright";

const PROJECT_ROOT = path.resolve(__dirname, "../..");

describe("Página pública — marca d'água VEXO fluida, sem rolagem horizontal", () => {
  let browser: Browser;
  let html: string;

  beforeAll(async () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), "vexo-watermark-overflow-"));
    const outCssPath = path.join(tmpDir, "compiled.css");
    execFileSync("npx", ["tailwindcss", "-i", "./src/app/globals.css", "-o", outCssPath, "--minify"], {
      cwd: PROJECT_ROOT,
      stdio: "pipe",
    });
    const compiledCss = readFileSync(outCssPath, "utf8");
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

    const { default: HomePage } = await import("./page");
    const markup = renderToStaticMarkup(createElement("div", null, HomePage()));
    html = `<!DOCTYPE html><html class="dark"><head><meta charset="utf-8"><style>${compiledCss}</style></head><body class="bg-vexo-bg text-vexo-fg antialiased">${markup}</body></html>`;
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
  });

  // Mede a largura real do texto "VEXO" renderizado (não a caixa do <p>,
  // que ocupa 100% de largura por causa do inset-x-0 — ver comentário em
  // globals.css) via Range.getBoundingClientRect, igual à medição usada
  // pra calibrar os coeficientes do clamp().
  async function measure(width: number) {
    const page = await browser.newPage({ viewport: { width, height: 1200 } });
    await page.setContent(html);
    await page.waitForTimeout(50);

    const watermark = page.getByText("VEXO", { exact: true }).last();
    const fontSizePx = await watermark.evaluate((el) => parseFloat(window.getComputedStyle(el).fontSize));
    const glyphWidth = await watermark.evaluate((el) => {
      const textNode = el.firstChild;
      if (!textNode) return null;
      const range = document.createRange();
      range.selectNodeContents(textNode);
      return range.getBoundingClientRect().width;
    });
    const bandBox = await page.locator(".pub-cta-band").boundingBox();
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);

    await page.close();
    return { fontSizePx, glyphWidth: glyphWidth as number, bandWidth: bandBox!.width, scrollWidth, clientWidth };
  }

  for (const width of [390, 768, 1366]) {
    it(`${width}px: sem rolagem horizontal da página`, async () => {
      const { scrollWidth, clientWidth } = await measure(width);
      expect(scrollWidth, `${width}px: scrollWidth (${scrollWidth}) > clientWidth (${clientWidth})`).toBeLessThanOrEqual(
        clientWidth
      );
    });
  }

  it("390px (celular): a palavra ocupa entre 85% e 100% da largura do bloco", async () => {
    const { glyphWidth, bandWidth } = await measure(390);
    const ratio = glyphWidth / bandWidth;
    expect(ratio).toBeGreaterThanOrEqual(0.85);
    expect(ratio).toBeLessThanOrEqual(1.0);
  });

  it("768px (tablet): proporção intermediária, também dentro de ~85%-100% da largura do bloco", async () => {
    const { glyphWidth, bandWidth } = await measure(768);
    const ratio = glyphWidth / bandWidth;
    expect(ratio).toBeGreaterThanOrEqual(0.8);
    expect(ratio).toBeLessThanOrEqual(1.0);
  });

  it("1366px (notebook): tamanho IDÊNTICO ao de antes desta mudança (320px, glyph ~860.8px)", async () => {
    const { fontSizePx, glyphWidth } = await measure(1366);
    expect(fontSizePx).toBeCloseTo(320, 1);
    expect(glyphWidth).toBeCloseTo(860.83, 0);
  });

  it("1920px (tela bem larga): continua idêntico ao notebook — o bloco não cresce além do max-w-[1040px]", async () => {
    const { fontSizePx } = await measure(1920);
    expect(fontSizePx).toBeCloseTo(320, 1);
  });
});
