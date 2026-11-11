// Contraste (AA) dos tokens do Relatório — lido direto de globals.css,
// pra quebrar o teste se alguém mudar um valor e derrubar a legibilidade.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const css = readFileSync(path.resolve(__dirname, "../app/globals.css"), "utf8");

function token(name: string): [number, number, number] {
  const m = css.match(new RegExp(`--${name}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+);`));
  if (!m) throw new Error(`token --${name} não encontrado`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function luminance([r, g, b]: [number, number, number]): number {
  const c = [r, g, b].map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe("tokens do Relatório — contraste AA (4.5:1) sobre o painel e o fundo", () => {
  const backgrounds = ["vexo-report-base-top", "vexo-report-base-bottom", "vexo-report-raised-top", "vexo-report-raised-bottom", "vexo-report-inset", "vexo-bg"];
  const texts = ["vexo-report-caption", "vexo-report-delta-up", "vexo-report-delta-down", "vexo-tab-fg"];
  for (const bg of backgrounds) {
    for (const fg of texts) {
      it(`${fg} sobre ${bg}`, () => {
        expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it("dois níveis de bloco, todos acima do fundo: base (escuro) < raised (claro); topo de cada um mais claro que a base", () => {
    const L = (n: string) => luminance(token(n));
    expect(L("vexo-report-base-top")).toBeGreaterThan(L("vexo-report-base-bottom"));
    expect(L("vexo-report-raised-top")).toBeGreaterThan(L("vexo-report-raised-bottom"));
    expect(L("vexo-report-base-bottom")).toBeGreaterThan(L("vexo-bg"));
    expect(L("vexo-report-raised-bottom")).toBeGreaterThan(L("vexo-report-base-top"));
  });

  it("área rebaixada (inset) é mais escura que o bloco de gráfico que a contém", () => {
    expect(luminance(token("vexo-report-inset"))).toBeLessThan(luminance(token("vexo-report-raised-bottom")));
  });
});

describe("cores da comparação — vivas, nunca vermelho/rosa/coral", () => {
  it("alta é verde (G domina), queda é azul (B domina)", () => {
    const [ur, ug, ub] = token("vexo-report-delta-up");
    const [dr, dg, db] = token("vexo-report-delta-down");
    expect(ug).toBeGreaterThan(ur);
    expect(ug).toBeGreaterThan(ub);
    expect(db).toBeGreaterThan(dr);
    expect(db).toBeGreaterThan(dg);
  });

  it("mais saturadas que as cores normais equivalentes do sistema (verde #49b76c / azul claro antigo #5aa8d6)", () => {
    const sat = ([r, g, b]: [number, number, number]) => {
      const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255, l = (mx + mn) / 2;
      return mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1));
    };
    expect(sat(token("vexo-report-delta-up"))).toBeGreaterThan(sat(token("tab-icon-4")));
    expect(sat(token("vexo-report-delta-down"))).toBeGreaterThan(sat([90, 168, 214]));
  });
});
