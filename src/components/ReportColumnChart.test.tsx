import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportColumnChart } from "./ReportColumnChart";

// Regra de semanas/grupos vazios (pedido explícito, 9ª rodada): nunca
// mostra coluna nem rótulo de um grupo totalmente zerado (bug relatado:
// "28/09"/"26/10" apareciam sem nenhuma coluna em cima) — e o destaque de
// cor cheia (último grupo) sempre cai no último grupo QUE TEM dado, nunca
// no último índice da lista crua.
describe("ReportColumnChart — nunca mostra grupo vazio (sem coluna nem rótulo)", () => {
  it("grupo final vazio: rótulo e coluna somem, destaque cai no último com dado", () => {
    const markup = renderToStaticMarkup(
      <ReportColumnChart
        groups={[
          { label: "01/09", values: [5, 3] },
          { label: "08/09", values: [7, 4] },
          { label: "15/09", values: [0, 0] },
        ]}
        seriesLabels={["Agendaram", "Compareceram"]}
        ariaLabel="teste"
      />
    );
    expect(markup).not.toContain("15/09");
    expect(markup).toContain("08/09");
    // "08/09" (agora o último grupo exibido) recebe a classe off-white do
    // destaque; "01/09" (não é mais o penúltimo depois do filtro, mas
    // também não é o último) continua no tom apagado.
    const idx0109 = markup.indexOf("01/09");
    const idx0809 = markup.indexOf("08/09");
    expect(idx0109).toBeGreaterThanOrEqual(0);
    expect(idx0809).toBeGreaterThan(idx0109);
  });

  it("grupo vazio no MEIO da lista: também some (sem buraco visual, sem rótulo flutuando)", () => {
    const markup = renderToStaticMarkup(
      <ReportColumnChart
        groups={[
          { label: "01/09", values: [5, 3] },
          { label: "08/09", values: [0, 0] },
          { label: "15/09", values: [7, 4] },
        ]}
        seriesLabels={["Agendaram", "Compareceram"]}
        ariaLabel="teste"
      />
    );
    expect(markup).not.toContain("08/09");
    expect(markup).toContain("01/09");
    expect(markup).toContain("15/09");
  });

  it("destaque de cor cheia (reportColA, série 1) aparece exatamente 1 vez — no último grupo COM dado", () => {
    const markup = renderToStaticMarkup(
      <ReportColumnChart
        groups={[
          { label: "01/09", values: [5, 3] },
          { label: "08/09", values: [7, 4] },
          { label: "15/09", values: [0, 0] },
        ]}
        seriesLabels={["Agendaram", "Compareceram"]}
        ariaLabel="teste"
      />
    );
    // bg-vexo-reportColA (cor cheia) só na barra do último grupo com dado;
    // os outros usam reportColAMuted (a legenda também usa a cor cheia no
    // quadradinho, sempre — por isso o match é só na barra, não qualquer
    // ocorrência da classe).
    const fullBarCount = markup.split('rounded-t-sm bg-vexo-reportColA"').length - 1;
    expect(fullBarCount).toBe(1);
  });

  it("todos os grupos vazios: não quebra e mantém a lista original (nunca some tudo)", () => {
    const markup = renderToStaticMarkup(
      <ReportColumnChart
        groups={[
          { label: "01/09", values: [0, 0] },
          { label: "08/09", values: [0, 0] },
        ]}
        seriesLabels={["Agendaram", "Compareceram"]}
        ariaLabel="teste"
      />
    );
    expect(markup).toContain("01/09");
    expect(markup).toContain("08/09");
  });

  it("nenhum grupo vazio: comportamento idêntico a antes (nada filtrado)", () => {
    const markup = renderToStaticMarkup(
      <ReportColumnChart
        groups={[
          { label: "01/09", values: [5, 3] },
          { label: "08/09", values: [7, 4] },
        ]}
        seriesLabels={["Agendaram", "Compareceram"]}
        ariaLabel="teste"
      />
    );
    expect(markup).toContain("01/09");
    expect(markup).toContain("08/09");
  });
});
