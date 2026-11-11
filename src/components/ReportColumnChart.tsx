import { niceAxis } from "@/lib/report-chart-scale";

// Gráfico de colunas do Relatório (7ª rodada) — UM componente pros dois
// gráficos: "Evolução · últimos 3 meses" (Agendaram/Compareceram) e
// "Abordados por semana" (Abordados/Em conversa). Ver DESIGN.md.
//
// - Duas colunas por grupo, COLADAS (sem espaço dentro do grupo nem entre
//   grupos), largura FIXA pelo token --vexo-report-col-w (.report-col),
//   grupo inteiro centralizado — nunca estica com poucas colunas.
// - Cantos retos, no máximo 2px no topo (rounded-t-sm).
// - Último grupo em cor cheia (reportColA/reportColB), anteriores em
//   azul-acinzentado suave (…Muted).
// - Linhas de grade finas (1px, branco 8%) atrás das colunas, eixo Y à
//   esquerda (0 até o máximo, 3–4 marcas redondas, 12px cinza), linha de
//   base 1px um pouco mais clara, rótulo do grupo na base (último em
//   off-white). Número em cima de cada coluna; valor 0 não tem coluna nem
//   rótulo.
// - Fundo: o do bloco (plano). Sem seta, vinheta, sombra interna nem
//   degradê escuro.
// - 9ª rodada: nunca mostra grupo totalmente vazio (os dois valores = 0)
//   — nem a coluna (já não aparecia) nem o RÓTULO dele, que antes ficava
//   "flutuando" sem coluna em cima (bug relatado: "28/09"/"26/10" sem
//   dado). O destaque de cor cheia passa a ser sempre o último grupo QUE
//   TEM dado, nunca o último da lista crua. Só filtra se sobrar pelo menos
//   1 grupo com dado — com tudo vazio, mantém a lista original (nunca um
//   gráfico vazio é "melhor" que um com rótulos cortados por engano).
// - 10ª rodada: a LEGENDA sai deste componente e vira `ReportColumnLegend`
//   (abaixo), separada — é o que permite ao chamador (ClinicReportContent)
//   fixar a legenda no RODAPÉ do bloco (mesma altura entre os blocos),
//   independente da altura do gráfico em si, sem o componente precisar
//   saber nada sobre layout externo.
export type ColumnGroup = { label: string; values: [number, number] };

const SERIES_CLASSES: Array<{ full: string; muted: string }> = [
  { full: "bg-vexo-reportColA", muted: "bg-vexo-reportColAMuted" },
  { full: "bg-vexo-reportColB", muted: "bg-vexo-reportColBMuted" },
];

export function ReportColumnChart({ groups: allGroups, ariaLabel }: { groups: ColumnGroup[]; ariaLabel: string }) {
  const hasAnyData = allGroups.some((g) => g.values.some((v) => v > 0));
  const groups = hasAnyData ? allGroups.filter((g) => g.values.some((v) => v > 0)) : allGroups;
  const { max, ticks } = niceAxis(Math.max(0, ...groups.flatMap((g) => g.values)));
  const pct = (v: number) => Math.round((v / max) * 10000) / 100;
  const lastIndex = groups.length - 1;
  // Coluna do eixo Y só tão larga quanto o maior rótulo precisa.
  const digits = String(max).length;
  const axisWidthClass = digits <= 2 ? "w-6" : digits === 3 ? "w-8" : "w-10";

  return (
    <div className="flex" role="img" aria-label={ariaLabel}>
      {/* Eixo Y: marcas alinhadas às linhas de grade (mesma altura do plot). */}
      <div className={`relative mt-3 h-24 shrink-0 ${axisWidthClass}`} aria-hidden="true">
        {ticks.map((t) => (
          <span
            key={t}
            className="absolute right-1.5 translate-y-1/2 text-[12px] leading-none text-vexo-reportCaption"
            style={{ bottom: `${pct(t)}%` }}
          >
            {t}
          </span>
        ))}
      </div>

      <div className="min-w-0 flex-1" aria-hidden="true">
        <div className="relative mt-3 h-24 border-b border-vexo-reportBaseline">
          {ticks
            .filter((t) => t > 0)
            .map((t) => (
              <div key={t} className="absolute inset-x-0 border-t border-vexo-reportGrid" style={{ bottom: `${pct(t)}%` }} />
            ))}
          <div className="absolute inset-0 flex justify-center">
            {groups.flatMap((g, gi) =>
              g.values.map((v, si) => (
                <div key={`${gi}-${si}`} className="report-col relative h-full">
                  {v > 0 && (
                    <>
                      <span
                        className={`absolute left-1/2 -translate-x-1/2 text-[11px] leading-none ${gi === lastIndex ? "text-vexo-tabFg" : "text-vexo-reportCaption"}`}
                        style={{ bottom: `calc(${pct(v)}% + 3px)` }}
                      >
                        {v}
                      </span>
                      <div
                        className={`absolute inset-x-0 bottom-0 rounded-t-sm ${gi === lastIndex ? SERIES_CLASSES[si]!.full : SERIES_CLASSES[si]!.muted}`}
                        style={{ height: `${pct(v)}%` }}
                      />
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
        <div className="mt-1 flex justify-center">
          {groups.map((g, gi) => (
            <span
              key={gi}
              className={`report-col-pair truncate text-center text-[12px] leading-none ${gi === lastIndex ? "text-vexo-tabFg" : "text-vexo-reportCaption"}`}
            >
              {g.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// Legenda dos dois pontinhos coloridos ("Abordados / Em conversa",
// "Agendaram / Compareceram") — separada do gráfico (10ª rodada) pra o
// chamador poder fixá-la no rodapé do bloco, alinhada com o rodapé dos
// blocos vizinhos, independente da altura do gráfico em si.
export function ReportColumnLegend({ seriesLabels }: { seriesLabels: [string, string] }) {
  return (
    <div className="flex items-center justify-center gap-3 text-[11px] leading-tight text-vexo-reportCaption" aria-hidden="true">
      <span className="flex items-center gap-1">
        <span className="inline-block h-2 w-2 rounded-sm bg-vexo-reportColA" /> {seriesLabels[0]}
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-2 w-2 rounded-sm bg-vexo-reportColB" /> {seriesLabels[1]}
      </span>
    </div>
  );
}
