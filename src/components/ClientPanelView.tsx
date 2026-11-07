import { prisma } from "@/lib/prisma";
import { getClinicMetrics, getAttendanceMetrics, appointmentDisplayStatus, getDailyApproachCounts, startOfDay, addDays } from "@/lib/metrics";
import { leadDisplayParts } from "@/lib/lead-display";
import { ClientPanelTabs } from "@/components/ClientPanelTabs";
import type { NeedsHumanLead } from "@/components/NeedsHumanBanner";
import { PanelOverview } from "@/components/PanelOverview";
import { PanelAppointmentsColumn, type PanelAppointmentItem } from "@/components/PanelAppointmentsColumn";
import { getReactivationCards, getReactivationReturnStats, RETURN_PERIOD_OPTIONS, type SendReactivationWhatsAppResult } from "@/lib/reactivation";
import { isAppointmentVisibleInList, type SetAppointmentReturnPeriodResult } from "@/lib/appointments";
import { getNoShowCards } from "@/lib/no-show-cards";
import { getHotLeadCards } from "@/lib/hot-lead-cards";
import { getNeverScheduledCards } from "@/lib/never-scheduled-cards";
import { mergePanelCards } from "@/lib/panel-cards";
import { groupAppointmentsForPanel } from "@/lib/panel-appointments";
import type { ToggleHotLeadCardSentResult } from "@/lib/hot-lead-cards";

// Condição pra mostrar as abas "Painel / Bônus Full Face" — só a conta
// (Clinic.fullFaceBonusEnabled). Pura e exportada de propósito (testável
// sem precisar montar o componente inteiro nem mockar Prisma): bug
// investigado nesta rodada ("aba Bônus aparece no celular mas não no
// computador") confirmou que a causa NUNCA foi uma condição de largura de
// tela aqui — era um proxy/CDN cacheando a resposta de /dashboard antes
// do interruptor ser ligado (ver next.config.js, headers() cobrindo
// /dashboard/* agora). Esta função prova que a lógica de exibição em si
// é 100% independente de viewport.
export function shouldShowClientBonusTab(bonusHref: string | undefined, fullFaceBonusEnabled: boolean): boolean {
  return Boolean(bonusHref) && fullFaceBonusEnabled;
}

// Segunda como início da semana (getDay(): 0=dom..6=sáb).
function startOfWeek(d: Date): Date {
  const diff = (d.getDay() + 6) % 7;
  return startOfDay(addDays(d, -diff));
}
function toDateParam(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Períodos do seletor "Abordados / Em conversa / Agendaram" (ver
// PanelOverview.tsx) — 21 dias adicionado pra cobrir um piloto de teste
// rodando por esse período inteiro (revisão do funil completo com a
// clínica no fim do teste); 14/28 dias junto por serem os mesmos múltiplos
// de semana que já faziam sentido no meio do caminho. N dias sempre inclui
// hoje: de addDays(todayStart, -(N-1)) até addDays(todayStart, 1).
const PANEL_PERIODS: { days: number; label: string }[] = [
  { days: 1, label: "Hoje" },
  { days: 7, label: "7 dias" },
  { days: 14, label: "14 dias" },
  { days: 21, label: "21 dias" },
  { days: 28, label: "28 dias" },
];

// Corpo do Painel do cliente — extraído de /dashboard pra ser reaproveitado
// por DUAS visões internas do CRM: "Ver painel de [clínica]"
// (/crm/painel-cliente/[id], sem sidebar nenhuma, aberta em nova aba a
// partir de /crm/painel) e o item "Painel" de dentro do contexto de uma
// clínica (/crm/clinicas/[id]/painel — mantém a sidebar da clínica visível,
// Pipeline/Follow-up etc. continuam ali, só o conteúdo muda). As três
// telas renderizam este mesmo componente, só trocando de onde o clinicId
// vem, pra onde os links de navegação de semana apontam (base), e se o
// componente desenha sua própria página inteira ou só o conteúdo
// (standalone — false quando já existe um layout por fora fornecendo
// min-h-screen/padding/max-w-6xl, como o AppShell da clínica). noShowAction
// é injetável porque a ação por trás do botão "Não compareceu" precisa
// rodar sob uma sessão diferente em cada contexto (CLIENT vs
// INTERNAL_ADMIN/STAFF) — ver NoShowButton. headerAction é um slot opcional
// ao lado do nome da clínica (ver PanelOverview.tsx) — só o Painel de
// dentro do contexto de uma clínica usa (botão "Criar painel", ver
// ClientAccessModal); /dashboard e /crm/painel-cliente/[id] não passam nada.
//
// Reorganização visual (ver docs/design-audit.md): o corpo da tela (layout,
// agrupamento, componentes de apresentação) foi reescrito nesta rodada —
// PanelOverview.tsx/PanelAppointmentsColumn.tsx/ReactivationRail.tsx. Esta
// função continua responsável só por BUSCAR os dados e calcular os
// agrupamentos puros (mergePanelCards/groupAppointmentsForPanel) — nenhuma
// query, regra de elegibilidade, parâmetro de URL (?week) ou dado mudou.
export async function ClientPanelView({
  clinicId,
  week,
  base,
  noShowAction,
  returnPeriodAction,
  reactivationSentAction,
  reactivationSendWhatsappAction,
  noShowCardSentAction,
  noShowCardSendWhatsappAction,
  hotLeadCardSentAction,
  neverScheduledCardSentAction,
  standalone = true,
  headerAction,
  bonusHref,
}: {
  clinicId: string;
  week?: string;
  base: string;
  noShowAction?: (appointmentId: string, status: "COMPLETED" | "NO_SHOW") => Promise<unknown>;
  // Mesmo motivo de noShowAction — botão "Retorno" (ver RetornoButton.tsx).
  returnPeriodAction?: (appointmentId: string, selection: number | "unset") => Promise<SetAppointmentReturnPeriodResult>;
  // Mesmo motivo de noShowAction acima (comentário grande logo abaixo) —
  // marcar/desmarcar um card da Reativação como enviado (ver
  // ReactivationRail) também precisa rodar sob uma sessão diferente em
  // cada contexto.
  reactivationSentAction?: (appointmentId: string, thresholdDays: number) => Promise<unknown>;
  // Envio de verdade do WhatsApp da Reativação (decisão explícita: só
  // WhatsApp) — mesmo motivo de reactivationSentAction acima, injetável
  // por contexto (CLIENT em /dashboard, INTERNAL_ADMIN/STAFF no CRM).
  reactivationSendWhatsappAction?: (appointmentId: string, thresholdDays: number) => Promise<SendReactivationWhatsAppResult>;
  // Card "Faltou" e card "Quente" (ver ReactivationRail/PanelCardBadge) —
  // mesmo motivo de injeção por contexto dos três acima. Undefined (não
  // passado por /dashboard) deixa ReactivationRail cair nos próprios
  // defaults (as *ClientAction de dashboard/actions.ts).
  noShowCardSentAction?: (appointmentId: string, step: number) => Promise<unknown>;
  noShowCardSendWhatsappAction?: (appointmentId: string, step: number) => Promise<SendReactivationWhatsAppResult>;
  hotLeadCardSentAction?: (conversationId: string, step: number) => Promise<ToggleHotLeadCardSentResult>;
  // Card "Não agendou" (ver ReactivationRail/PanelCardBadge/
  // never-scheduled-cards.ts) — mesmo motivo de injeção por contexto dos
  // demais acima.
  neverScheduledCardSentAction?: (conversationId: string, step: number) => Promise<unknown>;
  standalone?: boolean;
  headerAction?: React.ReactNode;
  // Rota do guia "Bônus Full Face" neste contexto (/dashboard/bonus ou
  // /crm/painel-cliente/[id]/bonus). As abas "Painel / Bônus Full Face"
  // só aparecem com o interruptor da conta ligado
  // (Clinic.fullFaceBonusEnabled); desligado, nada aparece.
  bonusHref?: string;
}) {
  const now = new Date();
  const todayStart = startOfDay(now);

  const parsedRef = week ? new Date(week) : now;
  const weekStart = startOfWeek(Number.isNaN(parsedRef.getTime()) ? now : parsedRef);

  const [clinic, periods, returnPeriods, appointments, dailyApproached, needsHumanConversations, reactivationCards, noShowCards, hotLeadCards, neverScheduledCards, sentReactivationSlots] = await Promise.all([
    prisma.clinic.findUniqueOrThrow({
      where: { id: clinicId },
      select: {
        name: true,
        whatsappStatus: true,
        instagramAccount: { select: { id: true } },
        googleCalendarAccount: { select: { id: true } },
        reactivationConfig: { select: { availablePeriods: true } },
        fullFaceBonusEnabled: true,
      },
    }),
    // Cada período já sai emparelhado com suas próprias métricas (em vez de
    // duas listas separadas e um índice pra juntar depois) — o TS não tem
    // como garantir que duas listas mapeadas do mesmo array na mesma ordem
    // continuam alinhadas depois de passar por Promise.all, então preferia
    // marcar periodMetrics[i] como possivelmente undefined.
    Promise.all(
      PANEL_PERIODS.map(async (p) => {
        const from = addDays(todayStart, -(p.days - 1));
        const to = addDays(todayStart, 1);
        const [metrics, attendance] = await Promise.all([
          getClinicMetrics(clinicId, from, to),
          getAttendanceMetrics(clinicId, from, to, now),
        ]);
        return { ...p, metrics, attendance };
      })
    ),
    // "N enviadas · M voltaram" do cabeçalho da Reativação (ver
    // ReactivationRail.tsx/PanelOverview.tsx) — mesmas janelas de
    // PANEL_PERIODS acima, pra acompanhar o seletor de período já existente.
    getReactivationReturnStats(clinicId, PANEL_PERIODS, now),
    // AJUSTE (2026-10-29, 6ª rodada, pedido explícito "exclua da lista os
    // agendamentos cancelados"): status: { not: "CANCELLED" } — só filtro
    // de EXIBIÇÃO desta lista; nada é apagado do banco (um agendamento
    // cancelado continua existindo, só não aparece mais aqui), e as
    // métricas (getClinicMetrics/getAttendanceMetrics acima, em
    // metrics.ts) já excluíam CANCELLED antes disso, por conta própria —
    // não dependiam desta lista, então continuam exatamente como estavam.
    prisma.appointment.findMany({
      where: { clinicId, status: { not: "CANCELLED" } },
      include: { lead: true },
      orderBy: { scheduledAt: "desc" },
      take: 100,
    }),
    getDailyApproachCounts(clinicId, weekStart),
    // Faixa "precisa de atendimento humano" (ver NeedsHumanBanner) — o
    // Painel do cliente não buscava NENHUMA Conversation antes disto, só
    // Appointment; escopado por clinicId, igual a tudo mais nesta tela (o
    // clinicId em si já vem validado — da sessão CLIENT em /dashboard, ou
    // do parâmetro de rota só acessível a sessão INTERNAL no CRM — nunca de
    // entrada do usuário). "Mais recente primeiro": lastMessageAt (ou
    // updatedAt como desempate/fallback quando null) — ambos ficam
    // congelados no momento da escalada pra NEEDS_HUMAN na prática (nada
    // atualiza esses campos enquanto o status permanece NEEDS_HUMAN), então
    // refletem "há quanto tempo está esperando humano", não só "criado há
    // quanto tempo".
    prisma.conversation.findMany({
      where: { clinicId, status: "NEEDS_HUMAN" },
      include: { lead: true },
      orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
      take: 50,
    }),
    getReactivationCards(clinicId, now),
    getNoShowCards(clinicId, now),
    getHotLeadCards(clinicId, now),
    getNeverScheduledCards(clinicId, now),
    // Agendamentos com o prazo de retorno TRAVADO (ver RetornoButton.tsx/
    // setAppointmentReturnPeriod, appointments.ts) — qualquer card de
    // Reativação já enviado pra aquele agendamento, em qualquer prazo.
    prisma.reactivationCardSlot.findMany({
      where: { sentAt: { not: null }, appointment: { clinicId } },
      select: { appointmentId: true },
    }),
  ]);

  const panelCards = mergePanelCards({ hotLeadCards, noShowCards, reactivationCards, neverScheduledCards });
  const availableReturnPeriods = clinic.reactivationConfig?.availablePeriods ?? [...RETURN_PERIOD_OPTIONS];
  const lockedReturnPeriodAppointmentIds = new Set(sentReactivationSlots.map((s) => s.appointmentId));
  // Pedido explícito: "Compareceu" só fica visível aqui por
  // ATTENDED_VISIBLE_DAYS dias (ver isAppointmentVisibleInList,
  // appointments.ts) — só filtro de EXIBIÇÃO, nada é apagado (mesmo
  // princípio do filtro de CANCELLED já aplicado na query acima); os
  // demais status não têm prazo, continuam sempre. clinicId passado pra
  // isAppointmentVisibleInList isentar a Clínica Demo (DEMO_CLINIC_ID) da
  // regra — lá, todos os agendamentos continuam aparecendo, pra
  // testes/vídeos; nas demais clínicas, nada muda.
  const visibleAppointments = appointments.filter((a) => isAppointmentVisibleInList(a, now, clinicId));

  const appointmentItems: PanelAppointmentItem[] = visibleAppointments.map((a) => {
    const { primary, handle } = leadDisplayParts(a.lead, a.manualTitle);
    return {
      id: a.id,
      scheduledAt: a.scheduledAt,
      status: a.status,
      displayStatus: appointmentDisplayStatus(a, now),
      leadId: a.leadId,
      primary,
      handle,
      profilePictureUrl: a.lead?.profilePictureUrl ?? null,
      phone: a.lead?.phone ?? null,
      returnPeriodDays: a.returnPeriodDays,
      locked: lockedReturnPeriodAppointmentIds.has(a.id),
    };
  });
  const { upcoming, awaitingResponse, history } = groupAppointmentsForPanel(appointmentItems, now);

  const needsHumanLeads: NeedsHumanLead[] = needsHumanConversations.map((conv) => {
    const { primary } = leadDisplayParts(conv.lead, null);
    return {
      conversationId: conv.id,
      primary,
      profilePictureUrl: conv.lead.profilePictureUrl,
      igUsername: conv.lead.igUsername,
    };
  });

  const weekNav = {
    prevHref: `${base}?week=${toDateParam(addDays(weekStart, -7))}`,
    todayHref: base,
    nextHref: `${base}?week=${toDateParam(addDays(weekStart, 7))}`,
    label: `${weekStart.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} – ${addDays(weekStart, 6).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`,
  };

  return (
    <div className={standalone ? "min-h-screen bg-vexo-bg px-4 pt-4 pb-6 sm:px-8 sm:pt-6 sm:pb-8" : undefined}>
      <div className={standalone ? "mx-auto max-w-6xl" : undefined}>
        {shouldShowClientBonusTab(bonusHref, clinic.fullFaceBonusEnabled) && (
          <ClientPanelTabs active="painel" panelHref={base} bonusHref={bonusHref!} />
        )}

        <PanelOverview
          clinicName={clinic.name}
          instagramConnected={Boolean(clinic.instagramAccount)}
          googleConnected={Boolean(clinic.googleCalendarAccount)}
          whatsappConnected={clinic.whatsappStatus === "open"}
          headerAction={headerAction}
          periods={periods}
          returnPeriods={returnPeriods}
          weekNav={weekNav}
          dailyApproached={dailyApproached}
          cards={panelCards}
          action={reactivationSentAction}
          sendWhatsappAction={reactivationSendWhatsappAction}
          noShowToggleAction={noShowCardSentAction}
          noShowSendWhatsappAction={noShowCardSendWhatsappAction}
          hotLeadToggleAction={hotLeadCardSentAction}
          neverScheduledToggleAction={neverScheduledCardSentAction}
          rightColumn={
            <PanelAppointmentsColumn
              upcoming={upcoming}
              awaitingResponse={awaitingResponse}
              history={history}
              needsHumanLeads={needsHumanLeads}
              availableReturnPeriods={availableReturnPeriods}
              noShowAction={noShowAction}
              returnPeriodAction={returnPeriodAction}
            />
          }
        />
      </div>
    </div>
  );
}
