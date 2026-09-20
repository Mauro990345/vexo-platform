import type { ChatTurn } from "@/lib/anthropic";

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
