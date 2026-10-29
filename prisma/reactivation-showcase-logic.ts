// Lógica PURA (sem Prisma) do script prisma/seed-reactivation-showcase.ts
// — mesmo padrão testável de clean-no-photo-demo-data-logic.ts. Decide
// QUAIS agendamentos já existentes virar "showcase" (2 Instagram + 3
// WhatsApp, prazos diferentes, 1 já enviado) e QUE data/prazo cada um
// precisa pra o card cair na janela de exibição (computeReturnContactWindow,
// reactivation.ts — scheduledAt + prazo, ±3 dias) HOJE, toda vez que o
// script roda — nunca cria paciente novo, só re-marca os já existentes.

export type ShowcaseCandidate = {
  appointmentId: string;
  leadId: string;
  scheduledAt: Date;
  hasPhone: boolean;
};

export type ShowcaseSelectionWarning = "not_enough_instagram" | "not_enough_whatsapp";

export type ShowcaseSelection = {
  instagram: ShowcaseCandidate[];
  whatsapp: ShowcaseCandidate[];
  warnings: ShowcaseSelectionWarning[];
};

// Um candidato por LEAD (já garantido por quem chama — ver
// selectReactivationCandidates em reactivation.ts, reaproveitada pelo
// script antes desta função) — aqui só separa por canal (mesmo critério
// de reactivationChannelForLead: tem telefone = WhatsApp, sem telefone =
// Instagram) e pega os N mais recentes (scheduledAt desc) de cada grupo.
// Nunca lança erro por grupo insuficiente — devolve o que tiver, com um
// aviso (quem chama decide se aborta ou segue com menos de 5).
export function selectShowcaseCandidates(
  candidates: ShowcaseCandidate[],
  desiredInstagramCount: number,
  desiredWhatsappCount: number
): ShowcaseSelection {
  const sorted = [...candidates].sort(
    (a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime() || a.appointmentId.localeCompare(b.appointmentId)
  );
  const instagramPool = sorted.filter((c) => !c.hasPhone);
  const whatsappPool = sorted.filter((c) => c.hasPhone);

  const instagram = instagramPool.slice(0, desiredInstagramCount);
  const whatsapp = whatsappPool.slice(0, desiredWhatsappCount);

  const warnings: ShowcaseSelectionWarning[] = [];
  if (instagram.length < desiredInstagramCount) warnings.push("not_enough_instagram");
  if (whatsapp.length < desiredWhatsappCount) warnings.push("not_enough_whatsapp");

  return { instagram, whatsapp, warnings };
}

export type ShowcaseAssignment = {
  appointmentId: string;
  leadId: string;
  channel: "INSTAGRAM" | "WHATSAPP";
  periodDays: number;
  alreadySent: boolean;
};

// Prazos distintos, um por agendamento escolhido, nesta ordem fixa (não
// precisa ser os mesmos 5 sempre — só precisam ser DIFERENTES entre si,
// pedido explícito). Ordem de atribuição: Instagram primeiro (na ordem
// scheduledAt desc já decidida por selectShowcaseCandidates), depois
// WhatsApp — sempre a MESMA ordem entre execuções (mesma lista de
// candidatos de entrada = mesmo resultado), o que torna o script
// idempotente sem precisar de nenhum estado além do que já está no banco
// (appointmentId é estável; só a ORDEM da seleção inicial depende de
// scheduledAt, por isso o script principal persiste os 5 ids escolhidos
// na primeira execução — ver reactivation-showcase-state.json).
const SHOWCASE_PERIODS = [30, 60, 90, 120, 150] as const;

// Qual item (0-indexado, na ordem combinada instagram+whatsapp) já nasce
// "enviado" (✓ esmaecido) — pedido explícito "um deles já no estado
// enviado". Fixo no índice 2 (o 3º, primeiro item do grupo WhatsApp numa
// seleção 2+3) — WhatsApp porque é o canal que o VEXO manda de verdade
// (ver sendReactivationWhatsAppMessage, reactivation.ts); Instagram
// continua copiar+abrir manual, não faria sentido simular "já enviado"
// automático lá.
const ALREADY_SENT_INDEX = 2;

export function assignShowcasePeriods(selection: ShowcaseSelection): ShowcaseAssignment[] {
  const ordered: { candidate: ShowcaseCandidate; channel: "INSTAGRAM" | "WHATSAPP" }[] = [
    ...selection.instagram.map((candidate) => ({ candidate, channel: "INSTAGRAM" as const })),
    ...selection.whatsapp.map((candidate) => ({ candidate, channel: "WHATSAPP" as const })),
  ];
  return ordered.map(({ candidate, channel }, index) => ({
    appointmentId: candidate.appointmentId,
    leadId: candidate.leadId,
    channel,
    periodDays: SHOWCASE_PERIODS[index % SHOWCASE_PERIODS.length]!,
    alreadySent: index === ALREADY_SENT_INDEX,
  }));
}

// scheduledAt necessário pra computeReturnContactWindow(scheduledAt, periodDays)
// cair exatamente em cima de `now` (bem no meio da janela de ±3 dias, não
// só raspando a borda) — SEMPRE recalculado a partir de `now`, nunca do
// scheduledAt atual da linha: é isso que torna o script re-executável
// (cada execução nova recentra a janela em cima do "agora" daquela
// execução, não importa quantos dias se passaram desde a última vez).
export function computeShowcaseScheduledAt(now: Date, periodDays: number): Date {
  return new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
}

// Mascara um telefone pro resumo final (pedido explícito "diga quais
// cards enviam pra qual número (mascarado)") — mantém DDD + primeiro
// dígito e os 2 últimos, esconde o meio. Funciona com ou sem "+55"/"55"
// na frente (normaliza só dígitos antes de mascarar).
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 6) return "*".repeat(digits.length);
  const headLen = 4; // DDD (2) + início do número (2)
  const tailLen = 2;
  const head = digits.slice(0, headLen);
  const tail = digits.slice(-tailLen);
  const maskedLen = digits.length - headLen - tailLen;
  return `${head}${"*".repeat(Math.max(maskedLen, 0))}${tail}`;
}
