// Decide como as mensagens de "foto de resultado" (antes/depois, ver
// ResultPhoto no schema e send_result_photo em src/lib/anthropic.ts) saem
// pro lead — puro/testável sem tocar Prisma, seguindo o mesmo padrão de
// conversation-context.ts (lógica de decisão separada da orquestração que
// grava no banco, que fica em conversation-pipeline.ts).
//
// Sem legenda cadastrada (ResultPhoto.caption vazio/null — inclusive toda
// foto cadastrada antes desse campo existir): comportamento IDÊNTICO ao
// de antes, só a foto sozinha. Com legenda: a legenda sai como mensagem de
// texto própria, alguns segundos ANTES da foto — nunca junto/depois —
// porque é isso que dá pro lead ler o contexto ("separei um resultado
// parecido com o que você quer") antes da imagem chegar, em vez de receber
// uma imagem sem explicação nenhuma.

export type ResultPhotoInput = {
  imageUrl: string;
  caption: string | null;
};

// Minúsculas + sem acento + sem espaço nas pontas — mesma normalização pros
// dois lados da comparação (categoria cadastrada e categoria pedida pelo
// modelo), senão "Botox"/"BOTOX"/"Botox " nunca bateriam com "botox".
function normalizeCategoryText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

// Bug real reportado: a busca antiga usava só "categoria cadastrada CONTÉM
// o texto pedido" (ver histórico de sendResultPhoto) — então o modelo
// precisava adivinhar a palavra EXATA cadastrada; "rugas" ou "toxina
// botulínica" nunca batiam com a categoria "botox", mesmo sendo
// claramente o mesmo procedimento. Este mapa é só uma AJUDA de casamento
// (nunca substitui o cadastro — se a clínica não cadastrou nenhuma foto
// de botox, nenhum sinônimo aqui faz uma foto aparecer do nada). Chaves e
// valores já em minúsculas/sem acento, pra comparar direto com
// normalizeCategoryText.
const RESULT_PHOTO_CATEGORY_SYNONYMS: Record<string, string[]> = {
  botox: ["toxina botulinica", "rugas", "linhas de expressao", "testa"],
  "preenchimento labial": ["labial", "labios", "boca"],
  "harmonizacao facial": ["harmonizacao"],
};

// Dado um termo já normalizado (categoria cadastrada OU categoria pedida
// pelo modelo — ambos textos curtos, tipo rótulo), devolve ele mesmo mais
// todo termo do grupo de sinônimos ao qual ele pertence (se pertencer a
// algum) — "botox" expande pra incluir "rugas"/"toxina botulinica"/etc.,
// e vice-versa.
function expandCategoryGroup(normalizedTerm: string): string[] {
  const variants = new Set<string>([normalizedTerm]);
  for (const [canonical, synonyms] of Object.entries(RESULT_PHOTO_CATEGORY_SYNONYMS)) {
    const groupTerms = [canonical, ...synonyms];
    const belongsToGroup = groupTerms.some(
      (term) => normalizedTerm.includes(term) || term.includes(normalizedTerm)
    );
    if (belongsToGroup) {
      for (const term of groupTerms) variants.add(term);
    }
  }
  return [...variants];
}

function wordsOf(normalizedText: string): Set<string> {
  // >=3 caracteres só pra não deixar preposição/artigo ("de", "da", "o")
  // contar como "palavra em comum" entre duas categorias que não têm nada
  // a ver uma com a outra.
  return new Set(normalizedText.split(/[^a-z0-9]+/).filter((word) => word.length >= 3));
}

function hasCommonWord(a: string, b: string): boolean {
  const wordsA = wordsOf(a);
  for (const word of wordsOf(b)) {
    if (wordsA.has(word)) return true;
  }
  return false;
}

// 3 = igual (depois de normalizar/expandir sinônimo) · 2 = um contém o
// outro · 1 = pelo menos uma palavra em comum · 0 = nada a ver.
function categoryMatchScore(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 3;
  if (a.includes(b) || b.includes(a)) return 2;
  if (hasCommonWord(a, b)) return 1;
  return 0;
}

export type ResultPhotoCandidate = {
  category: string;
  createdAt: Date;
};

// Busca tolerante — substitui o "contains" exato de antes. Casa a
// categoria pedida pelo modelo com as cadastradas por, nessa ordem de
// preferência: igual (já normalizado/expandido por sinônimo) > contém num
// sentido ou no outro > palavra em comum > sinônimo cadastrado no mapa
// acima. Em empate de pontuação, ganha a foto mais recente (mesmo
// critério de antes, orderBy createdAt desc). Null quando nada bate —
// quem chama decide o que fazer (ver sendResultPhoto,
// conversation-pipeline.ts: devolve a lista de categorias cadastradas pro
// modelo tentar de novo).
export function findBestResultPhotoMatch<T extends ResultPhotoCandidate>(requestedCategory: string, candidates: T[]): T | null {
  const normalizedQuery = normalizeCategoryText(requestedCategory);
  if (!normalizedQuery || candidates.length === 0) return null;

  const queryVariants = expandCategoryGroup(normalizedQuery);

  let best: T | null = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    const candidateVariants = expandCategoryGroup(normalizeCategoryText(candidate.category));

    let score = 0;
    for (const queryVariant of queryVariants) {
      for (const candidateVariant of candidateVariants) {
        score = Math.max(score, categoryMatchScore(queryVariant, candidateVariant));
      }
    }

    if (score === 0) continue;
    if (score > bestScore || (score === bestScore && best && candidate.createdAt > best.createdAt)) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

// Usado pra decidir se o LOTE do lead (debounce, pode ter várias mensagens
// — ver conversation-pipeline.ts) já demonstrou interesse num procedimento
// CADASTRADO, mesmo antes de qualquer resposta da IA — ver isFirstTurnEver
// em canSendResultPhoto, abaixo: um lote que já cita um procedimento
// cadastrado não deve ser tratado como "primeira mensagem de um lead
// frio", mesmo que ainda não exista nenhuma Message de AI nesta conversa.
// Direção única de propósito (texto SEMPRE contém o termo, nunca o
// contrário — o texto livre do lead costuma ser bem mais longo que o
// rótulo da categoria).
export function textMentionsRegisteredCategory(freeText: string, registeredCategories: string[]): boolean {
  const normalizedText = normalizeCategoryText(freeText);
  if (!normalizedText) return false;

  for (const category of registeredCategories) {
    const normalizedCategory = normalizeCategoryText(category);
    if (!normalizedCategory) continue;
    for (const term of expandCategoryGroup(normalizedCategory)) {
      if (normalizedText.includes(term)) return true;
    }
  }
  return false;
}

// Regra nova (substitui o limite antigo de 1 por conversa/fôlego):
// contando as já enviadas no fôlego atual (ver resultPhotoBreathStart,
// conversation-pipeline.ts), no máximo esse número de fotos — a mesma foto
// nunca se repete, e nunca mais de uma é enviada no mesmo turno, mesmo
// dentro do limite. Aplicado em código (send_result_photo), nunca no
// aiSystemPrompt — ver canSendResultPhoto, abaixo.
export const MAX_IMAGES_PER_CONVERSATION = 2;

export type ResultPhotoGateInput = {
  // Nenhuma Message de AI foi enviada ainda nesta conversa — "entrada
  // sutil" pedida: nunca manda foto na primeira mensagem de um lead frio,
  // mesmo que a categoria exista e o limite ainda não tenha sido atingido.
  isFirstTurnEver: boolean;
  // Já saiu uma foto de resultado NESTE MESMO turno (chamada anterior de
  // send_result_photo dentro do mesmo generateLeadReply) — nunca duas no
  // mesmo turno, mesmo que o limite da conversa ainda não tenha sido
  // atingido.
  alreadySentThisTurn: boolean;
  // URLs das fotos já enviadas no fôlego atual desta conversa (ver
  // resultPhotoBreathStart) — usado tanto pra contar o limite quanto pra
  // nunca repetir a mesma imagem.
  alreadySentImageUrls: string[];
  // ResultPhoto.imageUrl da foto que a ferramenta está tentando enviar
  // agora (já resolvida pela categoria, ver sendResultPhoto).
  candidateImageUrl: string;
};

export type ResultPhotoGateDecision = { allowed: true } | { allowed: false; reason: string };

// Pura/testável sem Prisma — a orquestração (consultar o histórico de
// Message, decidir o início do fôlego) fica em conversation-pipeline.ts,
// mesmo padrão de buildResultPhotoMessages/buildAvailabilityCheck.
export function canSendResultPhoto(input: ResultPhotoGateInput): ResultPhotoGateDecision {
  if (input.isFirstTurnEver) {
    return {
      allowed: false,
      reason:
        "Não envie foto de resultado na primeira mensagem de um lead novo — espere ele demonstrar interesse em algum procedimento antes.",
    };
  }
  if (input.alreadySentThisTurn) {
    return {
      allowed: false,
      reason: "Só é permitido enviar uma foto de resultado por turno — não chame esta ferramenta de novo agora.",
    };
  }
  if (input.alreadySentImageUrls.includes(input.candidateImageUrl)) {
    return {
      allowed: false,
      reason: "Esta foto específica já foi enviada nesta conversa — não repita a mesma imagem.",
    };
  }
  if (input.alreadySentImageUrls.length >= MAX_IMAGES_PER_CONVERSATION) {
    return {
      allowed: false,
      reason: `Limite de ${MAX_IMAGES_PER_CONVERSATION} fotos de resultado por conversa já atingido — siga sem enviar foto.`,
    };
  }
  return { allowed: true };
}

export type ResultPhotoHintCandidate = ResultPhotoCandidate & { imageUrl: string };

export type ResultPhotoHintInput<T extends ResultPhotoHintCandidate> = {
  // Texto concatenado de event.messages (o lote inteiro do turno, não só a
  // última mensagem) — mesmo texto usado por textMentionsRegisteredCategory
  // em isFirstTurnEver, ver conversation-pipeline.ts.
  leadBatchText: string;
  // Fotos cadastradas da clínica (prisma.resultPhoto.findMany) — mesma
  // lista usada por sendResultPhoto pra casar a categoria.
  candidates: T[];
  isFirstTurnEver: boolean;
  alreadySentThisTurn: boolean;
  alreadySentImageUrls: string[];
};

export type ResultPhotoHintResult = {
  context: string;
  matchedCategory: string;
};

// Bug real reportado: mesmo com a ferramenta send_result_photo sempre
// oferecida e a categoria batendo (ver findBestResultPhotoMatch), o
// modelo simplesmente não chamava a ferramenta quando o lead citava um
// procedimento ("Sim, percebo ruga e queria saber a respeito de botox") —
// nada no prompt avisava, turno a turno, que existe uma foto cadastrada
// pronta pra aquele procedimento específico. Este bloco de contexto
// (resultPhotoHintContext em conversation-pipeline.ts, junto de
// dateTimeContext/interestGateContext no contextNote — NUNCA no
// aiSystemPrompt) avisa isso explicitamente quando — e SÓ quando — as
// três condições abaixo valem ao mesmo tempo:
//   (a) o lote do lead cita um procedimento com foto cadastrada
//       (findBestResultPhotoMatch não devolve null);
//   (b) canSendResultPhoto permitiria o envio AGORA (limite de
//       MAX_IMAGES_PER_CONVERSATION não atingido, foto não repetida, não é
//       o primeiro turno de um lead frio);
//   (c) nenhuma foto já saiu NESTE turno (alreadySentThisTurn) — calculado
//       sempre antes de generateLeadReply rodar, então na prática é
//       trivialmente verdade no momento em que este bloco é montado, mas
//       entra no mesmo gate pra nunca divergir da regra real aplicada
//       dentro de send_result_photo.
// Null nos outros casos (sem menção, sem foto cadastrada pra categoria
// citada, ou canSendResultPhoto bloquearia) — SEM mencionar foto nenhuma,
// pra não plantar a ideia numa hora em que não devia.
export function buildResultPhotoHintContext<T extends ResultPhotoHintCandidate>(
  input: ResultPhotoHintInput<T>
): ResultPhotoHintResult | null {
  const matched = findBestResultPhotoMatch(input.leadBatchText, input.candidates);
  if (!matched) return null;

  const decision = canSendResultPhoto({
    isFirstTurnEver: input.isFirstTurnEver,
    alreadySentThisTurn: input.alreadySentThisTurn,
    alreadySentImageUrls: input.alreadySentImageUrls,
    candidateImageUrl: matched.imageUrl,
  });
  if (!decision.allowed) return null;

  return {
    matchedCategory: matched.category,
    context:
      `[Existe foto de resultado cadastrada para "${matched.category}" — chame a ferramenta send_result_photo ` +
      `com essa categoria exata ainda neste turno, depois de acolher a mensagem do lead, com uma entrada natural ` +
      `antes da foto.]`,
  };
}

export type OutboundMessageDraft = {
  content: string;
  mediaUrl?: string;
  scheduledFor: Date;
};

// Mesmo espaçamento de 5s já usado entre a resposta em texto da IA e a
// foto (ver conversation-pipeline.ts) e entre texto+anexo de um mesmo
// passo de follow-up (ver dispatchFollowUpSteps, src/lib/follow-up.ts) —
// tempo suficiente pro lead perceber que são duas mensagens em sequência,
// sem ficar um intervalo estranho entre elas.
export const CAPTION_TO_PHOTO_GAP_MS = 5_000;

export function buildResultPhotoMessages(photo: ResultPhotoInput, baseScheduledFor: Date): OutboundMessageDraft[] {
  const caption = photo.caption?.trim();

  const photoMessage: OutboundMessageDraft = {
    content: "[foto de resultado]",
    mediaUrl: photo.imageUrl,
    scheduledFor: caption ? new Date(baseScheduledFor.getTime() + CAPTION_TO_PHOTO_GAP_MS) : baseScheduledFor,
  };

  if (!caption) {
    return [photoMessage];
  }

  return [{ content: caption, scheduledFor: baseScheduledFor }, photoMessage];
}
