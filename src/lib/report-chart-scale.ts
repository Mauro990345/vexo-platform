// Escala do eixo Y dos gráficos de colunas do Relatório (7ª rodada) —
// pura, testável. Marcas redondas (passo 1/2/5 × 10^k), de 3 a 4 marcas
// contando o 0, sempre cobrindo o maior valor.
export function niceAxis(maxValue: number): { max: number; ticks: number[] } {
  const target = Math.max(1, maxValue);
  for (let exp = 0; ; exp++) {
    for (const base of [1, 2, 5]) {
      const step = base * 10 ** exp;
      const n = Math.max(2, Math.ceil(target / step));
      if (n <= 3) {
        const max = n * step;
        return { max, ticks: Array.from({ length: n + 1 }, (_, i) => i * step) };
      }
    }
  }
}
