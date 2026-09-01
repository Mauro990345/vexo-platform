import type { ChatTurn } from "@/lib/anthropic";

// Converte o histórico de Message (nosso schema) para o formato de turnos
// que o modelo espera. Fica num arquivo neutro (sem depender de
// conversation-pipeline.ts nem de follow-up.ts) porque os dois módulos
// precisam dela e importar um do outro criaria um ciclo.
export function toChatHistory(messages: { sender: string; content: string }[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const m of messages) {
    if (m.sender === "LEAD") {
      turns.push({ role: "user", content: m.content });
    } else if (m.sender === "AI" || m.sender === "HUMAN") {
      turns.push({ role: "assistant", content: m.content });
    }
    // SYSTEM (ex: vídeo enviado) não entra no contexto de diálogo do modelo.
  }
  return turns;
}
