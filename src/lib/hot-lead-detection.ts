// Detecção dos cards "Quente" (ver hot-lead-cards.ts) — por PALAVRA-CHAVE
// em pt-BR, sem LLM (pedido explícito: decisão barata e auditável, roda em
// todo ciclo do worker sem custo de API). Puro, testável sem Prisma.
//
// Normaliza pra minúsculas + remove acento antes de comparar — assim a
// lista de palavras-chave guarda só a forma SEM acento ("preco", não
// "preço"/"preço"), cobrindo as duas grafias (com e sem acento, erro de
// digitação comum em teclado de celular) sem duplicar entradas.
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export type HotLeadSignalCategory = "horario" | "preco_endereco";

// Cumprimentos ("oi", "olá", "bom dia", "boa tarde", "boa noite") são
// removidos do texto ANTES de qualquer busca de palavra-chave (correção —
// pedido explícito). Bug real que isto corrige: "boa tarde"/"boa noite"
// contêm, como SUBSTRING literal, exatamente "a tarde"/"a noite" (a forma
// COM preposição que já era, de propósito, a única forma válida de
// "tarde"/"noite" isoladas — ver HOT_LEAD_SCHEDULE_KEYWORDS_UNCONDITIONAL
// abaixo) — então um simples "Oi, boa noite" ou "boa tarde" sem mais nada
// virava falso-positivo de Quente antes desta correção. `\b` nas duas
// pontas evita cortar no meio de outra palavra (ex.: não mexe em "xboa").
const GREETING_PATTERNS: readonly RegExp[] = [/\boi\b/g, /\bola\b/g, /\bbom dia\b/g, /\bboa tarde\b/g, /\bboa noite\b/g];

function stripGreetings(normalizedText: string): string {
  let result = normalizedText;
  for (const pattern of GREETING_PATTERNS) result = result.replace(pattern, " ");
  return result;
}

// Hora explícita no texto ("14h", "9h", "14:30", "às 14" -> "as 14" depois
// do normalize) — usado só pra condicionar HOT_LEAD_SCHEDULE_KEYWORDS_CONDITIONAL
// abaixo (pedido explícito: "agenda"/"amanhã"/"essa semana" só contam
// junto de horário ou dia).
const HOUR_PATTERN = /\bas\s+\d{1,2}(:\d{2})?\b|\b\d{1,2}\s*h\b|\b\d{1,2}:\d{2}\b/;

// Dia da semana OU horário (com preposição, forma já exigida abaixo) —
// "co-ocorrência" que HOT_LEAD_SCHEDULE_KEYWORDS_CONDITIONAL precisa pra
// contar (pedido explícito).
const HOT_LEAD_DAY_OR_TIME_KEYWORDS: readonly string[] = [
  "segunda",
  "terca",
  "quarta",
  "quinta",
  "sexta",
  "sabado",
  "domingo",
  "de manha",
  "a tarde",
  "a noite",
];

function hasDayOrTimeSignal(normalizedText: string): boolean {
  return matchesAny(normalizedText, HOT_LEAD_DAY_OR_TIME_KEYWORDS) || HOUR_PATTERN.test(normalizedText);
}

// Contam SOZINHAS, sem precisar de mais nada no texto. "manhã"/"tarde"/
// "noite" só aparecem aqui já COM a preposição ("de manha"/"a tarde"/
// "a noite" — pedido explícito: bare "manha"/"tarde"/"noite" NUNCA conta
// sozinha, só com preposição ou hora, e aqui a preposição já é parte
// literal da entrada).
export const HOT_LEAD_SCHEDULE_KEYWORDS_UNCONDITIONAL: readonly string[] = [
  "horario",
  "que horas",
  "qual horario",
  "qual dia",
  "que dia",
  "disponibilidade",
  "tem vaga",
  "tem horario",
  "encaixe",
  "agendar",
  "marcar",
  "remarcar",
  ...HOT_LEAD_DAY_OR_TIME_KEYWORDS,
  "esse mes",
  "proxima semana",
];

// Só contam JUNTO de um dia da semana ou horário no mesmo texto (pedido
// explícito — "agenda"/"amanhã"/"essa semana" sozinhas são vagas demais:
// não indicam de verdade que o lead quer agendar).
export const HOT_LEAD_SCHEDULE_KEYWORDS_CONDITIONAL: readonly string[] = ["agenda", "amanha", "essa semana"];

// Mantida pra compatibilidade de quem só quer "a lista completa de
// palavras de horário" (ex.: relatar ao usuário) — não usada pela
// detecção em si, que agora distingue condicional de incondicional (ver
// detectHotLeadSignal abaixo).
export const HOT_LEAD_SCHEDULE_KEYWORDS: readonly string[] = [
  ...HOT_LEAD_SCHEDULE_KEYWORDS_UNCONDITIONAL,
  ...HOT_LEAD_SCHEDULE_KEYWORDS_CONDITIONAL,
];

export const HOT_LEAD_PRICE_ADDRESS_KEYWORDS: readonly string[] = [
  "preco",
  "valor",
  "quanto custa",
  "quanto e",
  "quanto fica",
  "quanto sai",
  "quanto fico",
  "parcela",
  "parcelamento",
  "cartao",
  "pix",
  "boleto",
  "promocao",
  "desconto",
  "orcamento",
  "investimento",
  "endereco",
  "localizacao",
  "onde fica",
  "onde e",
  "onde voces",
  "qual endereco",
  "fica onde",
  "bairro",
  "localidade",
];

// Pedir pra parar de receber mensagem (travas, item 4) — só relevante pro
// Quente (ver hot-lead-cards.ts); o Faltou já é travado pelo
// FollowUpLog.respondedAt existente (qualquer resposta encerra o log, "pare"
// incluída), não precisa desta checagem.
export const HOT_LEAD_STOP_KEYWORDS: readonly string[] = [
  "pare",
  "para de mandar",
  "nao quero mais",
  "nao manda mais",
  "nao me mande",
  "descadastr",
  "remover meu",
  "chega de mensagem",
  "nao me incomod",
  "deixa de enviar",
  "sai da minha lista",
];

function matchesAny(normalizedText: string, keywords: readonly string[]): boolean {
  return keywords.some((kw) => normalizedText.includes(kw));
}

// "Horário" tem prioridade sobre "preço/endereço" quando a mesma mensagem
// bate os dois (pedido explícito de ordenação: "entre os Quentes, horário
// antes de preço/endereço") — checado primeiro. Cumprimentos são removidos
// ANTES de qualquer busca (ver stripGreetings acima — corrige "Oi, boa
// noite"/"boa tarde" sozinhas virando falso-positivo).
export function detectHotLeadSignal(leadMessages: string[]): HotLeadSignalCategory | null {
  const text = stripGreetings(normalize(leadMessages.join(" \n ")));
  if (matchesAny(text, HOT_LEAD_SCHEDULE_KEYWORDS_UNCONDITIONAL)) return "horario";
  if (hasDayOrTimeSignal(text) && matchesAny(text, HOT_LEAD_SCHEDULE_KEYWORDS_CONDITIONAL)) return "horario";
  if (matchesAny(text, HOT_LEAD_PRICE_ADDRESS_KEYWORDS)) return "preco_endereco";
  return null;
}

export function leadAskedToStop(leadMessages: string[]): boolean {
  const text = stripGreetings(normalize(leadMessages.join(" \n ")));
  return matchesAny(text, HOT_LEAD_STOP_KEYWORDS);
}
