import type { ChatTurn } from "@/lib/anthropic";
import { formatBrazilDateTimeLabel } from "@/lib/timezone";

// Converte o histórico de Message (nosso schema) para o formato de turnos
// que o modelo espera. Fica num arquivo neutro (sem depender de
// conversation-pipeline.ts nem de follow-up.ts) porque os dois módulos
// precisam dela e importar um do outro criaria um ciclo.
export function toChatHistory(messages: { sender: string; content: string }[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const m of messages) {
    let role: ChatTurn["role"];
    if (m.sender === "LEAD") {
      role = "user";
    } else if (m.sender === "AI" || m.sender === "HUMAN") {
      role = "assistant";
    } else {
      continue; // SYSTEM (ex: vídeo enviado) não entra no contexto de diálogo do modelo.
    }

    // Mensagens consecutivas do MESMO papel — comum desde que o debounce
    // de mensagens rápidas (ver src/lib/inbound-debounce.ts) passou a
    // gravar VÁRIAS mensagens do lead como linhas separadas antes de gerar
    // uma única resposta — viram UM turno só, concatenadas. A API da
    // Anthropic (e a maioria dos provedores compatíveis com o formato da
    // OpenAI) espera papéis alternados; mandar dois turnos "user" seguidos
    // arrisca erro ou comportamento indefinido do provedor.
    const lastTurn = turns[turns.length - 1];
    if (lastTurn && lastTurn.role === role) {
      lastTurn.content = `${lastTurn.content}\n${m.content}`;
    } else {
      turns.push({ role, content: m.content });
    }
  }
  return turns;
}

function labelFor(sender: string, isFollowUp: boolean): string | null {
  if (sender === "LEAD") return "Lead";
  if (sender === "AI") return isFollowUp ? "Follow-up automático" : "IA";
  if (sender === "HUMAN") return "Atendente humano";
  return null; // SYSTEM — mesma exclusão de toChatHistory, ver acima.
}

// Bug real reportado (lead "Leonardo da Silva"): a IA respondeu ao retorno
// de um lead como se fosse o primeiro contato, ignorando uma conversa
// inteira anterior (incluindo a sequência de follow-up já concluída,
// com a "última mensagem" de desistência). toChatHistory (acima) manda o
// texto cru de cada mensagem, sem NENHUMA pista de quem disse o quê nem de
// quanto tempo passou entre os turnos — um lead que volta dias depois de
// uma sequência de follow-up fica, pro modelo, indistinguível de uma
// conversa corrida sem intervalo nenhum. Esta variante faz o MESMO
// agrupamento de turnos (API exige papéis alternados), mas prefixa CADA
// mensagem original com "[data/hora — autor]" antes de concatenar —
// nunca troca nem resume o texto, só rotula. Usada SÓ pro histórico
// mandado à geração da resposta de conversação (generateLeadReply, ver
// conversation-pipeline.ts) — classifyConversation (classificador de
// bastidor, follow-up.ts e conversation-pipeline.ts) continua usando
// toChatHistory sem rótulo, sem mudar nada do comportamento já calibrado
// dele.
export function toLabeledChatHistory(
  messages: { sender: string; content: string; createdAt: Date; isFollowUp?: boolean }[]
): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const m of messages) {
    let role: ChatTurn["role"];
    if (m.sender === "LEAD") {
      role = "user";
    } else if (m.sender === "AI" || m.sender === "HUMAN") {
      role = "assistant";
    } else {
      continue;
    }

    const label = labelFor(m.sender, Boolean(m.isFollowUp));
    const line = `[${formatBrazilDateTimeLabel(m.createdAt)} — ${label}] ${m.content}`;

    const lastTurn = turns[turns.length - 1];
    if (lastTurn && lastTurn.role === role) {
      lastTurn.content = `${lastTurn.content}\n${line}`;
    } else {
      turns.push({ role, content: line });
    }
  }
  return turns;
}
