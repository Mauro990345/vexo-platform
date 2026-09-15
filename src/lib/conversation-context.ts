import type { ChatTurn } from "@/lib/anthropic";
import { toChatHistory } from "@/lib/chat-history";

// Número de turnos (LEAD/IA/HUMAN — SYSTEM nunca vira turno, ver
// toChatHistory) recentes mandados por inteiro pro modelo de conversação a
// cada mensagem nova. Além desse ponto, os turnos mais antigos saem do
// histórico enviado e são substituídos por um resumo (ver
// summarizeOlderTurns em anthropic.ts) — sem isso, uma conversa longa
// manda tudo desde o primeiro dia em toda mensagem nova, pra sempre, sem
// nenhum teto de custo.
export const HISTORY_WINDOW_SIZE = 20;

export type ConversationContext = {
  // Os turnos recentes, na ordem cronológica de sempre — no máximo
  // HISTORY_WINDOW_SIZE, exatamente o histórico completo se a conversa
  // ainda não passou desse tamanho.
  recentHistory: ChatTurn[];
  // null quando a conversa inteira já cabe em recentHistory (nada ficou de
  // fora, não tem o que resumir). Só é gerado (chamando `summarize`)
  // quando existem turnos mais antigos que a janela.
  olderSummary: string | null;
};

// `summarize` é injetado (não chama a Anthropic direto aqui) de propósito:
// permite testar a lógica de corte/janela sozinha, sem rede nem API key —
// ver conversation-context.test.ts. A implementação real (Haiku) é
// summarizeOlderTurns, em anthropic.ts.
export async function buildConversationContext(
  messages: { sender: string; content: string }[],
  summarize: (olderTurns: ChatTurn[]) => Promise<string>
): Promise<ConversationContext> {
  const allTurns = toChatHistory(messages);

  if (allTurns.length <= HISTORY_WINDOW_SIZE) {
    return { recentHistory: allTurns, olderSummary: null };
  }

  const olderTurns = allTurns.slice(0, allTurns.length - HISTORY_WINDOW_SIZE);
  const recentHistory = allTurns.slice(-HISTORY_WINDOW_SIZE);
  const olderSummary = await summarize(olderTurns);

  return { recentHistory, olderSummary };
}

// Empacota o resumo (quando existe) como o primeiro turno mandado pro
// modelo — NUNCA dentro do system prompt: system é o prompt ESTÁVEL da
// clínica (cache_control em generateLeadReply, anthropic.ts, cacheado
// entre conversas diferentes da mesma clínica); um resumo é por conversa,
// colar ele ali invalidaria esse cache a cada mensagem, exatamente o
// anti-padrão que o cache_control corrigiu. Bônus: garante que o array de
// mensagens sempre comece com role "user" (exigência da API) mesmo quando
// a janela de HISTORY_WINDOW_SIZE corta bem no meio, deixando um turno "IA"
// como o mais antigo restante.
export function withOlderSummary(context: ConversationContext): ChatTurn[] {
  if (!context.olderSummary) return context.recentHistory;

  const summaryTurn: ChatTurn = {
    role: "user",
    content:
      `[Resumo automático do início desta conversa — NÃO é uma mensagem do lead, é só contexto do que já ` +
      `foi dito antes das mensagens reais abaixo: ${context.olderSummary}]`,
  };

  return [summaryTurn, ...context.recentHistory];
}
