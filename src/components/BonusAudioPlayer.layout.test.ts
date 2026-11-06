// Teste de layout + comportamento do player de áudio compacto do Bônus
// Full Face (BonusAudioPlayer.tsx) — pedido explícito: "~320px de largura
// máxima e ~32px de altura... vale para computador e celular, sem rolagem
// horizontal" (item 3) e "tocar no ícone de volume abre uma barra, sem
// mutar... no iPhone (Safari) nem o botão de mudo nem a barra aparecem...
// no Android e no computador, mostrar a barra" (item 4).
//
// Por que um bundle real (esbuild) + browser real (Playwright) em vez de
// renderToStaticMarkup: o player é interativo (useState/useEffect —
// detecção de iOS, play/pause, popover de volume), e isso só se comporta
// de verdade com hidratação/eventos reais num DOM de browser. O CSS
// usado é o FullFaceBonusGuide.module.css de verdade (mesmo arquivo que
// styles.player etc. apontam em produção, só com :global() desembrulhado
// pro browser de teste entender — ver nota em FullFaceBonusGuide.module.css
// sobre :global() não ser CSS padrão).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import http from "node:http";
import type { AddressInfo } from "node:net";
import esbuild from "esbuild";
import { chromium, type Browser } from "playwright";

const COMPONENT_DIR = __dirname;

function buildSilentWav(durationSeconds: number, sampleRate: number): Buffer {
  const numSamples = Math.floor(durationSeconds * sampleRate);
  const buffer = Buffer.alloc(44 + numSamples);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + numSamples, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate, 28);
  buffer.writeUInt16LE(1, 32);
  buffer.writeUInt16LE(8, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(numSamples, 40);
  buffer.fill(128, 44);
  return buffer;
}

const cssModuleShimPlugin: esbuild.Plugin = {
  name: "css-module-shim",
  setup(build) {
    build.onResolve({ filter: /FullFaceBonusGuide\.module\.css$/ }, () => ({
      path: "bonus-audio-player-css-shim",
      namespace: "css-shim",
    }));
    build.onLoad({ filter: /.*/, namespace: "css-shim" }, () => ({
      // Mapeia classe -> mesmo nome (sem hash de CSS Modules — igual à
      // técnica já usada neste repo pra verificar este mesmo CSS file).
      contents: `
        const styles = new Proxy({}, { get: (_, k) => String(k) });
        export default styles;
      `,
      loader: "js",
    }));
  },
};

describe("BonusAudioPlayer — layout (320–430px e 1024–1440px) e comportamento do volume", () => {
  let browser: Browser;
  let server: http.Server;
  let baseUrl: string;
  let compiledCss: string;

  beforeAll(async () => {
    const entry = `
      import { createRoot } from "react-dom/client";
      import { createElement } from "react";
      import { BonusAudioPlayer } from "${path.join(COMPONENT_DIR, "BonusAudioPlayer.tsx")}";
      createRoot(document.getElementById("root")).render(createElement(BonusAudioPlayer, { src: "/silence.wav" }));
    `;

    const result = await esbuild.build({
      stdin: { contents: entry, resolveDir: COMPONENT_DIR, loader: "tsx" },
      bundle: true,
      write: false,
      jsx: "automatic",
      platform: "browser",
      format: "iife",
      absWorkingDir: path.resolve(COMPONENT_DIR, "../.."),
      define: { "process.env.NODE_ENV": '"production"' },
      plugins: [cssModuleShimPlugin],
    });
    const bundleJs = result.outputFiles![0]!.text;

    const rawCss = readFileSync(path.join(COMPONENT_DIR, "FullFaceBonusGuide.module.css"), "utf8");
    compiledCss = rawCss.replace(/:global\(([^)]+)\)/g, "$1");

    const silentWav = buildSilentWav(1, 8000);

    server = http.createServer((req, res) => {
      if (req.url === "/") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          `<!DOCTYPE html><html class="dark"><head><meta charset="utf-8">
          <style>${compiledCss}</style>
          <style>*,*::before,*::after{box-sizing:border-box;}body{margin:0;background:#0e1716;padding:16px;}</style>
          </head><body><div class="scope"><div id="root"></div></div><script src="/bundle.js"></script></body></html>`
        );
        return;
      }
      if (req.url === "/bundle.js") {
        res.writeHead(200, { "Content-Type": "application/javascript" });
        res.end(bundleJs);
        return;
      }
      if (req.url === "/silence.wav") {
        res.writeHead(200, { "Content-Type": "audio/wav" });
        res.end(silentWav);
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://localhost:${port}`;

    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    server?.close();
  });

  async function openPlayer(viewportWidth: number, userAgent?: string) {
    const page = await browser.newPage({ viewport: { width: viewportWidth, height: 400 }, userAgent });
    await page.goto(baseUrl);
    await page.waitForTimeout(250);
    return page;
  }

  for (const width of [320, 375, 430]) {
    it(`${width}px (celular): o player cabe em ~320x32px, sem rolagem horizontal`, async () => {
      const page = await openPlayer(width);
      const box = await page.locator(".player").boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeLessThanOrEqual(321);
      expect(box!.height).toBeLessThanOrEqual(33);
      const hasHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(hasHorizontalScroll).toBe(false);
      await page.close();
    });
  }

  for (const width of [1024, 1440]) {
    it(`${width}px (computador): o player continua em ~320x32px, sem rolagem horizontal`, async () => {
      const page = await openPlayer(width);
      const box = await page.locator(".player").boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeLessThanOrEqual(321);
      expect(box!.height).toBeLessThanOrEqual(33);
      const hasHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(hasHorizontalScroll).toBe(false);
      await page.close();
    });
  }

  it("Android/computador: tocar no ícone de volume abre a barra deslizante SEM mutar o áudio", async () => {
    const page = await openPlayer(390, "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36");
    await page.waitForTimeout(150);
    const volBefore = await page.locator("audio").evaluate((el: HTMLAudioElement) => el.volume);
    await page.locator(".volumeWrap .playerBtn").click();
    await page.waitForTimeout(150);
    const volAfter = await page.locator("audio").evaluate((el: HTMLAudioElement) => el.volume);
    expect(volAfter).toBeCloseTo(volBefore, 5);
    expect(volAfter).toBeGreaterThan(0);
    expect(await page.locator(".volumePopover").isVisible()).toBe(true);
    await page.close();
  });

  it("computador (desktop UA): também mostra o botão e a barra de volume", async () => {
    const page = await openPlayer(1366);
    expect(await page.locator(".volumeWrap").isVisible()).toBe(true);
    await page.close();
  });

  it("iPhone (iOS Safari): nem o botão de mudo nem a barra de volume aparecem", async () => {
    const page = await openPlayer(
      390,
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
    );
    await page.waitForTimeout(150);
    expect(await page.locator(".volumeWrap").count()).toBe(0);
    // play/pause, progresso e tempo continuam disponíveis (só o volume some).
    expect(await page.locator(".playerBtn").count()).toBe(1);
    expect(await page.locator(".playerProgress").count()).toBe(1);
    await page.close();
  });
});
