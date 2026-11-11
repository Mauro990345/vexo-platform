// Responsividade do conteúdo do Relatório (pedido explícito, 2ª rodada):
// nas 4 larguras pedidas, sem rolagem horizontal da página E sem NENHUM
// rótulo cortado (bug relatado: "Taxa de comparecim...", "Comparec...",
// "Não comp..." apareciam truncados — ver MetricCard.tsx, que usa
// `truncate` no rótulo). Mesmo padrão de teste real (Playwright, Tailwind
// compilado) já usado no resto do repo.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { chromium, type Browser } from "playwright";
import { ClinicReportContent } from "./ClinicReportContent";
import { computeMonthlyPeriod, lastWeeksOfPeriod, evolutionMonthsOfPeriod } from "@/lib/report-period";
import { type ReportNumbersWithComparison } from "@/lib/report-metrics";

const PROJECT_ROOT = path.resolve(__dirname, "../..");

// Pior caso de texto: todos os rótulos mais longos presentes ao mesmo
// tempo, com taxa de comparecimento E comparação positiva nos 4 boxes do
// Resumo (as 2 linhas extras que o pedido original cortava). Mês de
// novembro/2026 começa num domingo — pior caso TAMBÉM pro gráfico
// semanal, que fica com 6 barras (o máximo possível num mês civil) em vez
// das 4-5 típicas.
const PERIOD = computeMonthlyPeriod(new Date("2026-11-15T12:00:00.000Z"));


const NUMBERS: ReportNumbersWithComparison = {
  period: PERIOD,
  funnel: { contacted: 128, inConversation: 94, scheduled: 47, attended: 36, noShow: 8 },
  attendanceRate: 0.766,
  attendanceBase: 47,
  contactedFromApproachLogs: true,
  followUp: { received: 41, responded: 12 },
  reactivation: { sent: 23, returned: 9 },
  isSimulated: false,
  previousComparison: { contactedPct: 14, inConversationPct: 9, scheduledPct: 22, attendedPct: 18 },
  // Valores de 3 dígitos, com as duas séries quase iguais — pior caso de
  // largura/sobreposição dos rótulos em cima das colunas em 360px.
  weekly: lastWeeksOfPeriod(PERIOD).map((w, i) => ({ ...w, contacted: 120 + i * 9, inConversation: 118 + i * 9 })),
  evolution: evolutionMonthsOfPeriod(PERIOD).map((p, i) => ({ ...p, scheduled: 480 + i * 30, attended: 476 + i * 30 })),
};

const MOBILE_WIDTHS = [360, 390, 414];
const DESKTOP_WIDTH = 1366;

const EXPECTED_LABELS = [
  "Abordados",
  "Em conversa",
  "Agendaram",
  "Compareceram",
  "Receberam",
  "Responderam",
  "29% responderam",
  "Enviadas",
  "Voltaram",
  "Comparecimento",
  "Abordados por semana",
  "Evolução · últimos 3 meses",
  "Abordados → Em conversa",
  "Em conversa → Agendaram",
  // 10ª rodada: 2 linhas no celular ("36 de 47 atendimentos" / "com data
  // no período"), 1 linha curta a partir de `sm` (sem a 2ª parte) — nunca
  // mais uma frase só; a cópia escondida (CSS, não removida do DOM, ver
  // ringBlockContent/weeklyBlockContent em ClinicReportContent.tsx) não
  // conta como "cortada" (scrollWidth/clientWidth ambos 0).
  "36 de 47 atendimentos",
  "com data no período",
];

describe("ClinicReportContent — layout real, sem rolagem horizontal nem rótulo cortado", () => {
  let browser: Browser;
  let compiledCss: string;
  let html: string;

  beforeAll(async () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), "vexo-report-content-overflow-"));
    const outCssPath = path.join(tmpDir, "compiled.css");
    execFileSync("npx", ["tailwindcss", "-i", "./src/app/globals.css", "-o", outCssPath, "--minify"], { cwd: PROJECT_ROOT, stdio: "pipe" });
    compiledCss = readFileSync(outCssPath, "utf8");
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

    const element = createElement(ClinicReportContent, { clinicName: "Clínica com Nome Razoavelmente Longo", frequency: "MONTHLY", numbers: NUMBERS });
    const markup = renderToStaticMarkup(element);
    html = `<!DOCTYPE html><html class="dark"><head><meta charset="utf-8"><style>${compiledCss}</style></head><body class="bg-vexo-bg text-vexo-fg antialiased"><main class="px-4 py-6">${markup}</main></body></html>`;
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
  });

  for (const width of [...MOBILE_WIDTHS, DESKTOP_WIDTH]) {
    it(`${width}px: sem rolagem horizontal da página`, async () => {
      const page = await browser.newPage({ viewport: { width, height: 1200 } });
      await page.setContent(html);
      await page.waitForTimeout(30);

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth, `${width}px: scrollWidth (${scrollWidth}) > clientWidth (${clientWidth})`).toBeLessThanOrEqual(clientWidth);

      await page.close();
    });

    it(`${width}px: nenhum rótulo de box fica cortado (truncado com "...")`, async () => {
      const page = await browser.newPage({ viewport: { width, height: 1200 } });
      await page.setContent(html);
      await page.waitForTimeout(30);

      for (const label of EXPECTED_LABELS) {
        const locator = page.getByText(label, { exact: true });
        const count = await locator.count();
        // >= 1: "Agendaram"/"Compareceram" também aparecem na legenda do
        // gráfico de evolução — todas as ocorrências precisam estar inteiras.
        expect(count, `rótulo "${label}" não encontrado por extenso em ${width}px (pode estar cortado)`).toBeGreaterThanOrEqual(1);

        const truncated = await locator.evaluateAll((els) => els.some((el) => el.scrollWidth > el.clientWidth + 1));
        expect(truncated, `rótulo "${label}" está visualmente cortado em ${width}px`).toBe(false);
      }

      await page.close();
    });
  }

  it("mostra a base da taxa de comparecimento e a comparação, em 360px", async () => {
    const page = await browser.newPage({ viewport: { width: 360, height: 1200 } });
    await page.setContent(html);
    await page.waitForTimeout(30);

    const bodyText = await page.textContent("body");
    expect(bodyText).toContain("36 de 47 atendimentos");
    expect(bodyText).toContain("com data no período");
    expect(bodyText).toContain("vs. anterior");

    await page.close();
  });

  for (const width of [...MOBILE_WIDTHS, DESKTOP_WIDTH]) {
    it(`${width}px: NENHUM texto da página transborda o próprio elemento nem sai do container`, async () => {
      const page = await browser.newPage({ viewport: { width, height: 1600 } });
      await page.setContent(html);
      await page.waitForTimeout(30);

      const problems = await page.evaluate(() => {
        const out: string[] = [];
        const root = document.querySelector("main")!.getBoundingClientRect();
        for (const el of Array.from(document.querySelectorAll("main p, main span, main h1"))) {
          const text = (el.textContent || "").trim();
          if (!text) continue;
          const r = el.getBoundingClientRect();
          if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).display !== "inline") out.push(`transborda: "${text}"`);
          if (r.right > root.right + 1 || r.left < root.left - 1) out.push(`fora do container: "${text}"`);
        }
        return out;
      });
      expect(problems).toEqual([]);
      await page.close();
    });
  }

  const CONTAINER_HTML = () =>
    html.replace('<main class="px-4 py-6">', '<main class="px-4 py-6"><div class="mx-auto w-full max-w-md sm:max-w-xl lg:max-w-4xl">').replace("</main>", "</div></main>");

  for (const width of [...MOBILE_WIDTHS, DESKTOP_WIDTH]) {
    it(`${width}px: gráficos de colunas — rótulos dentro do gráfico, sem se sobrepor, colunas coladas e sem estourar a largura máxima`, async () => {
      const page = await browser.newPage({ viewport: { width, height: 1600 } });
      await page.setContent(CONTAINER_HTML());
      await page.waitForTimeout(30);
      const result = await page.evaluate(() => {
        const out: string[] = [];
        const colWidths: number[][] = [];
        // 10ª rodada: o anel+semanas tem 2 cópias no DOM (bloco próprio no
        // celular, coluna do bloco único a partir de `sm` — uma delas
        // sempre escondida por CSS num ANCESTRAL (`display:none`), não
        // removida). `getClientRects().length === 0` é verdade tanto
        // quando o próprio elemento quanto um ancestral está
        // `display:none` — só a cópia VISÍVEL na largura atual entra na
        // medição.
        const isVisible = (el: Element) => el.getClientRects().length > 0;
        for (const chart of Array.from(
          document.querySelectorAll('[role="img"][aria-label^="Abordados por semana"], [role="img"][aria-label^="Evolução"]')
        ).filter(isVisible)) {
          const box = chart.getBoundingClientRect();
          const texts = Array.from(chart.querySelectorAll("span")).filter((e) => e.children.length === 0 && (e.textContent || "").trim());
          const rects = texts.map((t) => ({ t: t.textContent, r: t.getBoundingClientRect() }));
          for (const { t, r } of rects) {
            if (r.left < box.left - 0.5 || r.right > box.right + 0.5 || r.top < box.top - 0.5 || r.bottom > box.bottom + 0.5) out.push(`fora: ${t}`);
          }
          for (let i = 0; i < rects.length; i++)
            for (let j = i + 1; j < rects.length; j++) {
              const a = rects[i]!.r, b = rects[j]!.r;
              if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) out.push(`sobrepõe: ${rects[i]!.t} / ${rects[j]!.t}`);
            }
          const cols = Array.from(chart.querySelectorAll(".report-col")).map((c) => c.getBoundingClientRect());
          for (let i = 1; i < cols.length; i++) if (Math.abs(cols[i]!.left - cols[i - 1]!.right) > 0.5) out.push(`coluna não colada (${i})`);
          colWidths.push(cols.map((c) => Math.round(c.width * 10) / 10));
        }
        return { out, colWidths };
      });
      expect(result.out).toEqual([]);
      expect(result.colWidths).toHaveLength(2);
      // 10ª rodada: a largura BASE (--vexo-report-col-w) subiu pra ocupar
      // melhor o bloco com poucos grupos (ex.: Evolução, sempre 3 meses) —
      // os dois gráficos já não ficam mais NECESSARIAMENTE com a mesma
      // largura efetiva: cada um encolhe (`flex-shrink`) só o quanto
      // precisa pra caber no espaço disponível, e "Abordados por semana"
      // deste teste (pior caso, 6 semanas = 12 colunas) precisa encolher
      // mais que "Evolução" (sempre 3 meses = 6 colunas). Cada gráfico
      // continua uniforme DENTRO de si mesmo, e nenhum excede o máximo.
      for (const widths of result.colWidths) {
        expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(0.5);
      }
      const all = result.colWidths.flat();
      expect(Math.max(...all)).toBeLessThanOrEqual(width >= 1024 ? 26 : width >= 640 ? 32 : 36);
      await page.close();
    });
  }

  it("tela estreita (360px): blocos ocupam a largura toda (sem espaço vazio lateral) — anel e semanas são 2 blocos próprios (10ª rodada)", async () => {
    const page = await browser.newPage({ viewport: { width: 360, height: 1600 } });
    await page.setContent(html);
    await page.waitForTimeout(30);
    const widths = await page.evaluate(() =>
      Array.from(document.querySelectorAll("main .report-panel"))
        .filter((el) => el.getClientRects().length > 0)
        .map((el) => Math.round(el.getBoundingClientRect().width))
    );
    // Resumo, Comparecimento, Abordados por semana, Evolução, Follow-up/Reativação
    expect(widths.length).toBe(5);
    for (const w of widths) expect(w).toBe(360 - 32);
    await page.close();
  });

  it("1366px: anel/semanas (bloco único) e Evolução lado a lado, MESMA altura; Resumo e Follow-up/Reativação em largura total", async () => {
    const page = await browser.newPage({ viewport: { width: 1366, height: 1600 } });
    await page.setContent(CONTAINER_HTML());
    await page.waitForTimeout(30);
    const boxes = await page.evaluate(() =>
      Array.from(document.querySelectorAll("main .report-panel"))
        .filter((el) => el.getClientRects().length > 0)
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
        })
    );
    const [resumo, chart, evolution, followUp] = boxes;
    expect(boxes.length).toBe(4);
    expect(chart!.top).toBe(evolution!.top);
    expect(chart!.height).toBe(evolution!.height);
    expect(chart!.height).toBeGreaterThanOrEqual(260);
    expect(chart!.width).toBeLessThan(resumo!.width);
    expect(followUp!.width).toBe(resumo!.width);
    await page.close();
  });

  it("1366px: os 3 títulos (Comparecimento, Abordados por semana, Evolução) ficam na MESMA linha", async () => {
    const page = await browser.newPage({ viewport: { width: 1366, height: 1600 } });
    await page.setContent(CONTAINER_HTML());
    await page.waitForTimeout(30);
    const tops = await page.evaluate(() => {
      const titleTop = (text: string) => {
        const el = Array.from(document.querySelectorAll("main p")).find((p) => p.textContent === text && p.getClientRects().length > 0);
        return el ? Math.round(el.getBoundingClientRect().top) : null;
      };
      return { comparecimento: titleTop("Comparecimento"), semana: titleTop("Abordados por semana"), evolucao: titleTop("Evolução · últimos 3 meses") };
    });
    expect(tops.comparecimento).not.toBeNull();
    expect(tops.comparecimento).toBe(tops.semana);
    expect(tops.comparecimento).toBe(tops.evolucao);
    await page.close();
  });

  it("1366px: os 3 rodapés (texto do anel, legenda semanal, legenda da Evolução) ficam na MESMA linha", async () => {
    const page = await browser.newPage({ viewport: { width: 1366, height: 1600 } });
    await page.setContent(CONTAINER_HTML());
    await page.waitForTimeout(30);
    const tops = await page.evaluate(() => {
      const top = (el: Element | undefined) => (el ? Math.round(el.getBoundingClientRect().top) : null);
      const ringCaption = Array.from(document.querySelectorAll("main p")).find((p) => p.textContent === "36 de 47 atendimentos" && p.getClientRects().length > 0);
      const legends = Array.from(document.querySelectorAll("main .report-panel div[aria-hidden='true']")).filter(
        (el) => el.textContent?.includes("Abordados") && el.textContent?.includes("Em conversa") && el.getClientRects().length > 0
      );
      const evoLegends = Array.from(document.querySelectorAll("main .report-panel div[aria-hidden='true']")).filter(
        (el) => el.textContent?.includes("Agendaram") && el.textContent?.includes("Compareceram") && el.getClientRects().length > 0
      );
      return { ring: top(ringCaption), weekly: top(legends[0]), evolution: top(evoLegends[0]) };
    });
    expect(tops.ring).not.toBeNull();
    expect(tops.weekly).not.toBeNull();
    expect(tops.evolution).not.toBeNull();
    expect(tops.ring).toBe(tops.weekly);
    expect(tops.ring).toBe(tops.evolution);
    await page.close();
  });

  it("gráficos têm texto alternativo (role=img + aria-label) com os valores", async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 1600 } });
    await page.setContent(html);
    const labels = await page.evaluate(() => Array.from(document.querySelectorAll('[role="img"]')).map((el) => el.getAttribute("aria-label") || ""));
    expect(labels.some((l) => l.startsWith("Taxa de comparecimento: 77%"))).toBe(true);
    expect(labels.some((l) => l.startsWith("Abordados por semana, últimas 6 semanas —") && l.includes("semana de 30/11: 165 abordados, 163 em conversa"))).toBe(true);
    expect(labels.some((l) => l.startsWith("Evolução dos últimos 3 meses —") && l.includes("novembro: 540 agendaram, 536 compareceram"))).toBe(true);
    await page.close();
  });
});
