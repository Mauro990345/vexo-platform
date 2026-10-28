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

// Exportadas pra relatar ao usuário (pedido explícito: "me diga as
// palavras-chave do Quente") e pra teste direto da lista em si.
export const HOT_LEAD_SCHEDULE_KEYWORDS: readonly string[] = [
  "horario",
  "que horas",
  "qual horario",
  "qual dia",
  "que dia",
  "disponibilidade",
  "tem vaga",
  "tem horario",
  "encaixe",
  "agenda",
  "agendar",
  "marcar",
  "remarcar",
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
  "amanha",
  "essa semana",
  "esse mes",
  "proxima semana",
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
// antes de preço/endereço") — checado primeiro.
export function detectHotLeadSignal(leadMessages: string[]): HotLeadSignalCategory | null {
  const text = normalize(leadMessages.join(" \n "));
  if (matchesAny(text, HOT_LEAD_SCHEDULE_KEYWORDS)) return "horario";
  if (matchesAny(text, HOT_LEAD_PRICE_ADDRESS_KEYWORDS)) return "preco_endereco";
  return null;
}

export function leadAskedToStop(leadMessages: string[]): boolean {
  const text = normalize(leadMessages.join(" \n "));
  return matchesAny(text, HOT_LEAD_STOP_KEYWORDS);
}
