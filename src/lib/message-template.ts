// Função única de renderização de variáveis de template ({{primeiro_nome}},
// {{data_horario}}) — usada em TODOS os pontos de envio de mensagem
// automática (lembretes, reativação, follow-up) e como guarda final antes
// de qualquer envio de verdade (ver stripAnyLeftoverTemplateTokens, usada
// em sendWhatsappMessage/whatsapp.ts e sendInstagramMessage/instagram.ts).
//
// Bug real corrigido: a Reativação (reactivation.ts) nunca substituía
// variável nenhuma — o texto configurado pela clínica saía LITERAL, então
// "{{primeiro_nome}}" chegava assim mesmo no WhatsApp do lead. Os lembretes
// (whatsapp.ts/applyReminderTemplate) já substituíam, mas com
// `replaceAll` cru: nome desconhecido virava string vazia, deixando
// pontuação quebrada ("Oi, , tudo bem?"). Esta função resolve os dois
// problemas de uma vez: substitui quando o valor é confiável, e REMOVE a
// variável com uma limpeza de pontuação quando não é — nunca deixa
// "{{...}}" literal nem texto com vírgula/espaço sobrando.
//
// Pura de propósito (sem Prisma, sem fetch, sem Date "agora" implícito) —
// quem chama já resolveu os valores (nome vindo do cache do lead ou de
// getInstagramUserProfile, ver ensureLeadFirstNameFromInstagram em
// instagram.ts; data já formatada via formatDateTimeLabel, whatsapp.ts)
// antes de chamar isto. Mantém a lógica de texto 100% testável sem mock de
// banco/API.

export type MessageTemplateValues = {
  primeiro_nome?: string | null;
  data_horario?: string | null;
};

const KNOWN_VARIABLE_NAMES = ["primeiro_nome", "data_horario"] as const;

// Casa {{qualquer_identificador}} — não só os dois nomes conhecidos acima.
// É de propósito: uma variável desconhecida (nome digitado errado pela
// clínica, ou um token que só existe em outro contexto) passa pela MESMA
// limpeza de remoção que uma variável conhecida sem valor — nunca sobra
// "{{...}}" literal de nenhum tipo (pedido explícito).
const TOKEN_SOURCE = "\\{\\{[a-zA-Z_][a-zA-Z0-9_]*\\}\\}";
const ANY_TOKEN_RE = new RegExp(TOKEN_SOURCE, "g");
const COMMA_BEFORE_RE = new RegExp(`,\\s*${TOKEN_SOURCE}`, "g");
const START_TOKEN_CAPITALIZE_RE = new RegExp(`^${TOKEN_SOURCE},\\s*(\\p{Ll})`, "u");
const START_TOKEN_COMMA_RE = new RegExp(`^${TOKEN_SOURCE},\\s*`);
const SPACE_BEFORE_RE = new RegExp(`\\s*${TOKEN_SOURCE}`, "g");

// Limpeza final — roda sempre, mesmo sem nenhuma variável removida (texto
// totalmente preenchido também passa por aqui, sem custo nenhum). Ordem
// importa: a vírgula-antes-de-pontuação precisa vir ANTES do colapso de
// espaços duplos, senão ", ." e ",  ." teriam resultados diferentes.
function finalCleanup(text: string): string {
  return text
    .replace(/,\s*([!.?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([!.,?;:])/g, "$1")
    .trim();
}

// A função única pedida: substitui {{primeiro_nome}}/{{data_horario}}
// quando o valor é não-vazio; qualquer coisa que sobrar (conhecida sem
// valor, ou um token totalmente desconhecido) é removida com a limpeza de
// pontuação abaixo, nunca deixada literal.
export function renderMessageTemplate(template: string, values: MessageTemplateValues): string {
  let text = template;

  for (const name of KNOWN_VARIABLE_NAMES) {
    const value = values[name];
    if (value && value.trim()) {
      text = text.replaceAll(`{{${name}}}`, value.trim());
    }
  }

  // ", {{x}}" -> "" (ex.: "Oi, {{primeiro_nome}}! Faz..." -> "Oi! Faz...").
  text = text.replace(COMMA_BEFORE_RE, "");

  // "{{x}}, " no INÍCIO -> "" com a letra seguinte maiúscula; sem letra
  // minúscula em seguida (ex.: fim da string, ou já maiúscula), só remove.
  if (START_TOKEN_CAPITALIZE_RE.test(text)) {
    text = text.replace(START_TOKEN_CAPITALIZE_RE, (_match, firstLetter: string) => firstLetter.toLocaleUpperCase("pt-BR"));
  } else {
    text = text.replace(START_TOKEN_COMMA_RE, "");
  }

  // " {{x}}" -> "" (ex.: "avaliação {{data_horario}}." -> "avaliação.").
  text = text.replace(SPACE_BEFORE_RE, "");

  // Qualquer ocorrência que não bateu com nenhum padrão acima (token colado
  // sem espaço/vírgula antes, por exemplo) — rede de segurança final.
  text = text.replace(ANY_TOKEN_RE, "");

  return finalCleanup(text);
}

// Último guarda-chuva antes de qualquer envio de verdade (ver
// sendWhatsappMessage/whatsapp.ts, sendInstagramMessage/instagram.ts) —
// mesma limpeza de renderMessageTemplate, sem nenhum valor conhecido pra
// substituir, então QUALQUER "{{...}}" que ainda esteja no texto nesse
// ponto é removido. Rede de segurança pra um ponto de envio futuro que
// esqueça de chamar renderMessageTemplate antes — não é o caminho
// principal de limpeza (que é sempre render no momento de montar o
// texto/link), é defesa em profundidade.
export function stripAnyLeftoverTemplateTokens(text: string): string {
  return renderMessageTemplate(text, {});
}

// Trata o "nome do perfil do Instagram do lead" (já salvo em Lead.name ou
// recém-buscado via getInstagramUserProfile, ver ensureLeadFirstNameFromInstagram
// em instagram.ts) pra uso em {{primeiro_nome}}: só a primeira palavra,
// só letras (qualquer símbolo/emoji/número/pontuação sai, acento fica —
// \p{L} cobre letras acentuadas), primeira maiúscula e resto minúsculo.
// Nome pouco confiável (vazio, sem letra nenhuma depois de limpar, ou só 1
// letra) devolve null — quem chama trata null como "desconhecido" e deixa
// renderMessageTemplate remover a variável. NUNCA recebe o @ do Instagram
// como entrada aqui (pedido explícito) — isso é decisão de CADA chamador
// (reminders.ts/reactivation.ts nunca passam o @ pra esta função).
export function normalizeFirstNameForTemplate(rawName: string | null | undefined): string | null {
  if (!rawName) return null;

  const firstWord = rawName.trim().split(/\s+/)[0] ?? "";
  const lettersOnly = firstWord.replace(/[^\p{L}]/gu, "");
  if (lettersOnly.length < 2) return null;

  const lower = lettersOnly.toLocaleLowerCase("pt-BR");
  return lower.charAt(0).toLocaleUpperCase("pt-BR") + lower.slice(1);
}
