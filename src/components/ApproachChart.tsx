const WEEKDAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

// Gráfico "Abordagens por dia" — uma barra horizontal fina por dia da
// semana (não colunas verticais: a estrutura de linha-por-dia já existia
// antes desse refino e continua, só o traço ficou mais fino/elegante).
// Cada barra usa animate-bar-grow (ver tailwind.config.ts) pra crescer da
// esquerda pra direita ao montar, em vez de aparecer já na largura final.
//
// Estado vazio dedicado quando a semana inteira é zero: mostrar 7 linhas
// zeradas é ruído (repete a mesma informação: "nada aconteceu" 7 vezes) e
// parece um erro de carregamento, não um dado real. Uma linha de base
// pontilhada + texto discreto comunica a mesma coisa de um jeito só, sem
// competir visualmente com o gráfico de uma semana com dado de verdade.
export function ApproachChart({ counts }: { counts: number[] }) {
  const allZero = counts.every((c) => c === 0);
  const max = Math.max(1, ...counts);

  if (allZero) {
    return (
      <div className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-vexo-border/60 py-7">
        <p className="text-caption text-vexo-muted">Sem abordagens registradas essa semana</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {counts.map((count, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-7 shrink-0 text-caption leading-none text-vexo-muted">{WEEKDAY_LABELS[i]}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-sm bg-vexo-surface2">
            <div
              className="h-full origin-left animate-bar-grow rounded-sm bg-vexo-accent"
              style={{ width: `${(count / max) * 100}%` }}
            />
          </div>
          <span className="w-4 shrink-0 text-right text-caption font-medium leading-none">{count}</span>
        </div>
      ))}
    </div>
  );
}
