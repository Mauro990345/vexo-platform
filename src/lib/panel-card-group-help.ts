import { NO_SHOW_CARD_STEPS } from "@/lib/no-show-cards";
import { NEVER_SCHEDULED_CARD_STEPS } from "@/lib/never-scheduled-cards";
import { HOT_LEAD_STEP_DAYS } from "@/lib/hot-lead-cards";

// Texto curto de apoio pra cada grupo da aba "Cards do Painel"
// (FollowUpView.tsx) — pedido explícito: sempre visível, inclusive com o
// grupo fechado, pra alguém sem contexto (a quem a tela for delegada)
// entender o que cada card significa sem precisar abrir nada. Os dias
// vêm das CONSTANTES de cadência de cada card (NO_SHOW_CARD_STEPS/
// NEVER_SCHEDULED_CARD_STEPS/HOT_LEAD_STEP_DAYS) — se a cadência mudar no
// código, o texto acompanha sozinho, sem precisar editar esta string de
// novo. Reativação é a única sem dia nenhum (pedido explícito: "não
// colocar nenhuma informação sobre a janela de ±3 dias da Reativação
// nessa tela" — o prazo é por agendamento, escolhido pela secretária,
// não um dia fixo).

// "3, 10 e 30" / "2 e 4" / só "5" pra uma lista de 1 — formato de lista
// em português, usado nos três textos com dias dinâmicos abaixo.
function formatDayList(days: readonly number[]): string {
  if (days.length === 0) return "";
  if (days.length === 1) return `${days[0]}`;
  return `${days.slice(0, -1).join(", ")} e ${days[days.length - 1]}`;
}

// Passo 3 é o único só-Instagram (ver canal em no-show-cards.ts); o "D15"
// no texto também vem da constante (offsetDays do step 3), não escrito à
// mão — se esse passo mudar de dia de novo, o texto acompanha sozinho.
export function noShowGroupHelp(): string {
  const days = NO_SHOW_CARD_STEPS.map((s) => s.offsetDays).sort((a, b) => a - b);
  const instagramOnlyDay = NO_SHOW_CARD_STEPS.find((s) => s.step === 3)?.offsetDays;
  return `Leads que faltaram à consulta. Resgate para remarcar nos dias ${formatDayList(days)}. Canal: WhatsApp (D${instagramOnlyDay}: Instagram).`;
}

export function neverScheduledGroupHelp(): string {
  const days = NEVER_SCHEDULED_CARD_STEPS.map((s) => s.offsetDays).sort((a, b) => a - b);
  return `Leads que conversaram e não agendaram. Mensagens nos dias ${formatDayList(days)} convidando a agendar. Canal: Instagram.`;
}

export function hotLeadGroupHelp(): string {
  const days = [...HOT_LEAD_STEP_DAYS].sort((a, b) => a - b);
  return `Leads que demonstraram interesse (perguntaram preço ou endereço) e não agendaram. Mensagens nos dias ${formatDayList(days)}. Canal: Instagram.`;
}

// Estático, de propósito — sem dias (ver comentário grande no topo do
// arquivo).
export const REACTIVATION_GROUP_HELP = "Pacientes atendidos que devem retornar. Canal: WhatsApp.";
