// Detector de estagnação/repetição nas respostas da IA — pensado como a
// proteção PRINCIPAL contra loop automático (bot conversando com bot),
// complementando (não substituindo) o limite simples de contagem em
// conversation-pipeline.ts, que agora serve só de rede de segurança final.
//
// Motivação: um limite fixo de "N mensagens em M minutos" sempre tem
// exceção (um lead humano bem engajado pode gerar muita troca de
// mensagens rapidamente) — mas um loop de bot de verdade tem uma
// característica que uma conversa real não tem: as respostas da IA ficam
// repetitivas, porque o "lead" do outro lado está reagindo sempre do
// mesmo jeito (ou de um jeito cíclico) à mesma pergunta. Em vez de contar
// mensagens, este módulo mede o quão parecidas as ÚLTIMAS respostas da IA
// são entre si — se estão indo em círculo, geralmente têm palavras em
// comum demais.
//
// Métrica: similaridade de Jaccard sobre o conjunto de palavras de cada
// mensagem (normalizada: minúsculo, sem acento, sem pontuação). Simples,
// determinística, sem custo de API nem dependência nova — e funciona tanto
// pra repetição literal (mesma mensagem de novo) quanto pra loop alternado
// (A, B, A, B, ...), já que compara TODOS os pares dentro da janela, não
// só mensagens consecutivas.
//
// Puro/testável sem tocar Prisma, seguindo o mesmo padrão de
// result-photo-message.ts e conversation-context.ts — a orquestração
// (buscar as mensagens, decidir o que fazer com o resultado) fica em
// conversation-pipeline.ts.

// Tamanho da janela (últimas N respostas de texto da IA na conversa) e
// limiar de similaridade média acima do qual consideramos "estagnada".
// Valores de partida combinados com o usuário — ainda em calibração (ver
// STAGNATION_GUARD_SHADOW_MODE em conversation-pipeline.ts): o detector já
// roda e loga a similaridade calculada em produção, mas não pausa a
// conversa ainda, até haver alguns dias de dados reais pra confirmar se
// esses números são os certos.
export const STAGNATION_WINDOW_SIZE = 5;
export const STAGNATION_SIMILARITY_THRESHOLD = 0.6;

export type StagnationResult = {
  stuck: boolean;
  avgSimilarity: number;
  pairSimilarities: number[];
};

function normalizeToWordSet(text: string): Set<string> {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos (café -> cafe)
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // pontuação/emoji vira espaço
    .trim();
  return new Set(normalized.split(/\s+/).filter(Boolean));
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersectionSize = 0;
  for (const word of a) {
    if (b.has(word)) intersectionSize++;
  }
  const unionSize = a.size + b.size - intersectionSize;
  return unionSize === 0 ? 1 : intersectionSize / unionSize;
}

// Recebe as últimas mensagens da IA JÁ em ordem cronológica (mais antiga
// primeiro) — a ordem não afeta o cálculo (todos os pares são comparados
// igualmente), mas manter cronológica facilita ler o log/debugar.
export function detectStagnation(
  recentAiTexts: string[],
  options: { threshold?: number } = {}
): StagnationResult {
  const threshold = options.threshold ?? STAGNATION_SIMILARITY_THRESHOLD;

  if (recentAiTexts.length < 2) {
    return { stuck: false, avgSimilarity: 0, pairSimilarities: [] };
  }

  const wordSets = recentAiTexts.map(normalizeToWordSet);
  const pairSimilarities: number[] = [];
  for (let i = 0; i < wordSets.length; i++) {
    for (let j = i + 1; j < wordSets.length; j++) {
      pairSimilarities.push(jaccardSimilarity(wordSets[i]!, wordSets[j]!));
    }
  }

  const avgSimilarity = pairSimilarities.reduce((sum, s) => sum + s, 0) / pairSimilarities.length;
  return { stuck: avgSimilarity >= threshold, avgSimilarity, pairSimilarities };
}
