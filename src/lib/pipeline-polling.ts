// Lógica pura do polling do Pipeline (PipelineBoard.tsx) — mesma técnica
// já usada na tela de conversa (ver conversation-polling.ts, reexportada
// aqui): shouldPoll nunca dispara com a aba escondida nem com uma busca já
// em voo. O que é específico do Pipeline (card novo/mudou de coluna,
// contadores, nunca a mesma rolagem/interação do operador interrompida)
// vive só aqui — testável sem precisar de DOM/jsdom (este repo só tem
// infra de teste em Node puro, ver vitest.config.ts).
export { shouldPoll } from "./conversation-polling";

export type PipelineConversationSnapshot = {
  id: string;
  status: string;
  lastMessageAt: string | null;
  lead: { name: string | null; igUsername: string | null; profilePictureUrl: string | null };
  appointmentScheduledAt: string | null;
};

export type PipelineMetricsSnapshot = {
  newContacts: number;
  responded: number;
  scheduled: number;
  completed: number;
  noShow: number;
};

export type PipelineSnapshot = {
  conversations: PipelineConversationSnapshot[];
  metrics: PipelineMetricsSnapshot;
};

function conversationsEqual(a: PipelineConversationSnapshot, b: PipelineConversationSnapshot): boolean {
  return (
    a.id === b.id &&
    a.status === b.status &&
    a.lastMessageAt === b.lastMessageAt &&
    a.appointmentScheduledAt === b.appointmentScheduledAt &&
    a.lead.name === b.lead.name &&
    a.lead.igUsername === b.lead.igUsername &&
    a.lead.profilePictureUrl === b.lead.profilePictureUrl
  );
}

// Comparação rasa, mas de TODOS os campos que aparecem na tela — se bater
// 100% igual, o retrato buscado não traz nada novo: não vale a pena trocar
// o estado (evita re-renderizar o board à toa quando não há mudança
// nenhuma, pedido explícito).
export function snapshotsEqual(a: PipelineSnapshot, b: PipelineSnapshot): boolean {
  if (
    a.metrics.newContacts !== b.metrics.newContacts ||
    a.metrics.responded !== b.metrics.responded ||
    a.metrics.scheduled !== b.metrics.scheduled ||
    a.metrics.completed !== b.metrics.completed ||
    a.metrics.noShow !== b.metrics.noShow
  ) {
    return false;
  }
  if (a.conversations.length !== b.conversations.length) return false;
  return a.conversations.every((conv, i) => conversationsEqual(conv, b.conversations[i]!));
}

// Verdadeiro enquanto o operador está no meio de alguma interação que uma
// troca de estado no meio dela desfaria ou interromperia: o botão do mouse
// ainda apertado (ex: arrastando a rolagem horizontal das colunas) ou
// texto selecionado na tela (ex: copiando o nome de um lead). Sem nenhuma
// das duas, é seguro aplicar a atualização.
export function isInteracting(pointerDown: boolean, selectionType: "None" | "Caret" | "Range"): boolean {
  return pointerDown || selectionType === "Range";
}

// Decide o que fazer com um retrato recém-buscado: ignora se for idêntico
// ao atual (nada muda, nada re-renderiza); se o operador estiver
// interagindo com o board agora, guarda pra aplicar só depois (nunca
// interrompe/desfaz o que ele está fazendo); senão aplica na hora.
export function resolvePipelineUpdate(
  current: PipelineSnapshot,
  incoming: PipelineSnapshot,
  interactionActive: boolean
): { apply: boolean; pending: PipelineSnapshot | null } {
  if (snapshotsEqual(current, incoming)) return { apply: false, pending: null };
  if (interactionActive) return { apply: false, pending: incoming };
  return { apply: true, pending: null };
}
