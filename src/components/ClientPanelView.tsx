import Link from "next/link";
import { Calendar } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getClinicMetrics, getAttendanceMetrics, appointmentDisplayStatus, getDailyApproachCounts, startOfDay, addDays } from "@/lib/metrics";
import { ApproachChart } from "@/components/ApproachChart";
import { ApproachMetricsToggle } from "@/components/ApproachMetricsToggle";
import { AppointmentStatusBadge } from "@/components/AppointmentStatusBadge";
import { NoShowButton } from "@/components/NoShowButton";
import { RetornoButton } from "@/components/RetornoButton";
import { ChannelStatusPill } from "@/components/ChannelStatusPill";
import { normalizeBrazilianWhatsappNumber } from "@/lib/whatsapp";
import { leadDisplayParts } from "@/lib/lead-display";
import { LeadAvatar } from "@/components/LeadAvatar";
import { InstagramGlyphIcon, WhatsAppGlyphIcon } from "@/components/BrandIcons";
import { NeedsHumanBanner, type NeedsHumanLead } from "@/components/NeedsHumanBanner";
import { ReactivationRail } from "@/components/ReactivationRail";
import { getReactivationCards, RETURN_PERIOD_OPTIONS, type SendReactivationWhatsAppResult } from "@/lib/reactivation";
import type { SetAppointmentReturnPeriodResult } from "@/lib/appointments";
import { getNoShowCards } from "@/lib/no-show-cards";
import { getHotLeadCards } from "@/lib/hot-lead-cards";
import { mergePanelCards } from "@/lib/panel-cards";
import type { ToggleHotLeadCardSentResult } from "@/lib/hot-lead-cards";
import {
  MOBILE_APPOINTMENT_ROW_PADDING,
  MOBILE_APPOINTMENT_ACTION_GAP,
  MOBILE_ROW_GAP,
  MOBILE_LIST_GAP,
  MOBILE_DATE_ROW_GAP,
  MOBILE_DATE_ROW_MARGIN_TOP,
  MOBILE_NAME_TEXT_APPOINTMENT,
  MOBILE_HANDLE_TEXT,
  MOBILE_APPOINTMENT_HANDLE_CAP,
  MOBILE_APPOINTMENT_SECONDARY_TEXT,
  MOBILE_CARD_MIN_HEIGHT,
  MOBILE_TITLE_TEXT,
  MOBILE_SUBTITLE_TEXT,
  MOBILE_CLINIC_NAME_TEXT,
  MOBILE_CLINIC_DOT_SIZE,
  MOBILE_STATUS_BADGE_SIZE,
  MOBILE_STATUS_BADGE_ICON_SIZE,
  MOBILE_NAV_TEXT,
  MOBILE_NAV_BUTTON_MIN,
  MOBILE_NAV_BUTTON_PADDING,
  MOBILE_CHART_ROW_TEXT,
  MOBILE_SECTION_TITLE_TEXT,
  MOBILE_SECTION_DOT_SIZE,
} from "@/components/MobileCardScale";

// Marcar "Não compareceu" só faz sentido pra agendamento ainda em aberto —
// já compareceu ou já foi cancelado não tem o que alternar aqui.
const ACTIONABLE_STATUSES = ["SCHEDULED", "CONFIRMED", "NO_SHOW"];

// Segunda como início da semana (getDay(): 0=dom..6=sáb).
function startOfWeek(d: Date): Date {
  const diff = (d.getDay() + 6) % 7;
  return startOfDay(addDays(d, -diff));
}
function toDateParam(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Períodos do seletor "Abordados / Em conversa / Agendaram" (ver
// ApproachMetricsToggle) — 21 dias adicionado pra cobrir um piloto de teste
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
// ao lado do título "Painel" (canto superior direito) — só o Painel de
// dentro do contexto de uma clínica usa (botão "Criar painel", ver
// ClientAccessModal); /dashboard e /crm/painel-cliente/[id] não passam nada.
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
  standalone = true,
  headerAction,
}: {
  clinicId: string;
  week?: string;
  base: string;
  noShowAction?: (appointmentId: string, status: "COMPLETED" | "NO_SHOW") => Promise<unknown>;
  // Mesmo motivo de noShowAction — botão "Retorno" (ver RetornoButton.tsx).
  returnPeriodAction?: (appointmentId: string, selection: number | "none" | "unset") => Promise<SetAppointmentReturnPeriodResult>;
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
  standalone?: boolean;
  headerAction?: React.ReactNode;
}) {
  const now = new Date();
  const todayStart = startOfDay(now);

  const parsedRef = week ? new Date(week) : now;
  const weekStart = startOfWeek(Number.isNaN(parsedRef.getTime()) ? now : parsedRef);

  const [clinic, periods, appointments, dailyApproached, needsHumanConversations, reactivationCards, noShowCards, hotLeadCards, sentReactivationSlots] = await Promise.all([
    prisma.clinic.findUniqueOrThrow({
      where: { id: clinicId },
      select: {
        name: true,
        whatsappStatus: true,
        instagramAccount: { select: { id: true } },
        googleCalendarAccount: { select: { id: true } },
        reactivationConfig: { select: { availablePeriods: true } },
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
    prisma.appointment.findMany({
      where: { clinicId },
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
    // Agendamentos com o prazo de retorno TRAVADO (ver RetornoButton.tsx/
    // setAppointmentReturnPeriod, appointments.ts) — qualquer card de
    // Reativação já enviado pra aquele agendamento, em qualquer prazo.
    prisma.reactivationCardSlot.findMany({
      where: { sentAt: { not: null }, appointment: { clinicId } },
      select: { appointmentId: true },
    }),
  ]);

  const panelCards = mergePanelCards({ hotLeadCards, noShowCards, reactivationCards });
  const availableReturnPeriods = clinic.reactivationConfig?.availablePeriods ?? [...RETURN_PERIOD_OPTIONS];
  const lockedReturnPeriodAppointmentIds = new Set(sentReactivationSlots.map((s) => s.appointmentId));

  const needsHumanLeads: NeedsHumanLead[] = needsHumanConversations.map((conv) => {
    const { primary } = leadDisplayParts(conv.lead, null);
    return {
      conversationId: conv.id,
      primary,
      profilePictureUrl: conv.lead.profilePictureUrl,
      igUsername: conv.lead.igUsername,
    };
  });

  return (
    <div className={standalone ? "min-h-screen bg-vexo-bg px-4 pt-4 pb-6 sm:px-8 sm:pt-6 sm:pb-8" : undefined}>
      <div className={standalone ? "mx-auto max-w-6xl" : undefined}>
        <div className="mb-8 flex items-start justify-between gap-3">
          <div>
            {/* SÓ CELULAR (pedido explícito, 2026-10-29, 2ª rodada):
                leading-tight nos dois — sem isso, a entrelinha padrão
                (1.5 do Preflight) deixa a quebra de linha do subtítulo
                com espaço vertical grande demais, e o próprio título
                empurra o subtítulo mais pra baixo (a entrelinha extra
                conta pro espaço ABAIXO da linha de texto também).
                mt-[2px] fixa um gap pequeno e controlado entre os dois,
                em vez de depender da sobra da entrelinha do título.
                `sm:leading-normal`/`sm:mt-0` revertem pro visual de
                sempre em desktop (entrelinha 1.5 herdada, sem margem). */}
            <h1 className={`${MOBILE_TITLE_TEXT} font-semibold leading-tight sm:leading-normal tracking-tight`}>Painel</h1>
            <p className={`mt-[2px] sm:mt-0 ${MOBILE_SUBTITLE_TEXT} leading-tight sm:leading-normal text-vexo-muted`}>
              Acompanhamento em tempo real das abordagens no Instagram.
            </p>
          </div>
          {headerAction}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* min-w-0 nas duas colunas (2026-10-29, 4ª rodada — bug real
              achado na validação ao vivo desta rodada): um item de grid
              sem `min-width` explícito usa `min-width: auto` por padrão,
              que pra uma faixa (`grid-template-columns`) com trilha
              "auto" (como aqui — não há `grid-cols-1` explícito no
              celular, só o `lg:grid-cols-2`) deixa o item crescer até o
              tamanho MAX-CONTENT do conteúdo em vez de ficar preso à
              largura da tela — passou despercebido até agora porque
              nenhum conteúdo tinha um max-content tão largo quanto o
              novo card de Agendamentos (nome+@+telefone+botão numa
              largura mínima de conteúdo que passa de 700px se não for
              contido). Mesma categoria de bug do "min-w-0" já usado em
              vários lugares deste arquivo pra filhos de flex — aqui é a
              versão pro container `grid`. */}
          {/* Coluna esquerda: status de canais, semana e números */}
          <div className="min-w-0 space-y-6">
            <div className="space-y-3">
              {/* Linha do nome da clínica + pills — solta, sem card ao redor,
                  pra começar exatamente na mesma altura que o título
                  "Agendamentos" da coluna direita (mesmo critério: nenhum
                  padding/borda acima de nenhum dos dois). */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`shrink-0 rounded-full bg-vexo-success ${MOBILE_CLINIC_DOT_SIZE}`} />
                  <h2 className={`${MOBILE_CLINIC_NAME_TEXT} font-medium`}>{clinic.name}</h2>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <ChannelStatusPill
                    connected={Boolean(clinic.instagramAccount)}
                    label="Instagram"
                    icon={<InstagramGlyphIcon className={MOBILE_STATUS_BADGE_SIZE} />}
                    iconBg=""
                  />
                  <ChannelStatusPill
                    connected={Boolean(clinic.googleCalendarAccount)}
                    label="Google Calendar"
                    icon={<Calendar className={MOBILE_STATUS_BADGE_ICON_SIZE} strokeWidth={2.5} />}
                    iconBg="bg-blue-500"
                  />
                  <ChannelStatusPill
                    connected={clinic.whatsappStatus === "open"}
                    label="WhatsApp"
                    icon={<WhatsAppGlyphIcon className={MOBILE_STATUS_BADGE_SIZE} />}
                    iconBg=""
                  />
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-vexo-border bg-vexo-surface p-3.5">
                <div className="flex items-center justify-between gap-1.5">
                  <Link
                    href={`${base}?week=${toDateParam(addDays(weekStart, -7))}`}
                    className={`inline-flex items-center justify-center rounded-lg border border-vexo-border ${MOBILE_NAV_BUTTON_MIN} ${MOBILE_NAV_BUTTON_PADDING} ${MOBILE_NAV_TEXT} hover:border-vexo-accent`}
                  >
                    ← Semana
                  </Link>
                  <Link
                    href={base}
                    className={`inline-flex items-center justify-center rounded-lg border border-vexo-border ${MOBILE_NAV_BUTTON_MIN} ${MOBILE_NAV_BUTTON_PADDING} ${MOBILE_NAV_TEXT} hover:border-vexo-accent`}
                  >
                    Hoje
                  </Link>
                  <Link
                    href={`${base}?week=${toDateParam(addDays(weekStart, 7))}`}
                    className={`inline-flex items-center justify-center rounded-lg border border-vexo-border ${MOBILE_NAV_BUTTON_MIN} ${MOBILE_NAV_BUTTON_PADDING} ${MOBILE_NAV_TEXT} hover:border-vexo-accent`}
                  >
                    Semana →
                  </Link>
                </div>

                <div className="space-y-2 border-t border-vexo-border pt-3">
                  <p className={`${MOBILE_CHART_ROW_TEXT} font-medium uppercase tracking-wide text-vexo-muted`}>
                    Abordagens por dia · {weekStart.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} –{" "}
                    {addDays(weekStart, 6).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                  </p>
                  <ApproachChart counts={dailyApproached} />
                </div>
              </div>
            </div>

            <ApproachMetricsToggle periods={periods} />

            <ReactivationRail
              cards={panelCards}
              action={reactivationSentAction}
              sendWhatsappAction={reactivationSendWhatsappAction}
              noShowToggleAction={noShowCardSentAction}
              noShowSendWhatsappAction={noShowCardSendWhatsappAction}
              hotLeadToggleAction={hotLeadCardSentAction}
            />
          </div>

          {/* Coluna direita: agendamentos */}
          <div className="min-w-0 space-y-3">
            <div className="flex items-center gap-2">
              <span className={`shrink-0 rounded-full bg-vexo-accent ${MOBILE_SECTION_DOT_SIZE}`} />
              <h2 className={`${MOBILE_SECTION_TITLE_TEXT} font-semibold text-vexo-fg`}>Agendamentos</h2>
            </div>
            <NeedsHumanBanner leads={needsHumanLeads} />
            <div className={MOBILE_LIST_GAP}>
              {appointments.map((a) => {
                const { primary, handle } = leadDisplayParts(a.lead, a.manualTitle);
                return (
                <div
                  key={a.id}
                  // SÓ CELULAR (abaixo de sm/640px): padding vertical
                  // 12px (era 8px na rodada anterior — ver AJUSTE abaixo),
                  // altura mínima ~56px. Deixou de empilhar em flex-col:
                  // volta a ser uma linha só (conteúdo + botão lado a
                  // lado), igual desktop já era — a reorganização em 2
                  // linhas pedida fica DENTRO do conteúdo (nome+@ na
                  // linha 1, data/status/telefone na linha 2), não mais
                  // entre conteúdo e botão.
                  //
                  // AJUSTE (2026-10-29, 4ª rodada, pedido explícito): a
                  // altura comum (~77px) ficou um pouco menor que a dos
                  // cards de métrica (~89,5px) — aumentado o padding
                  // vertical (8->12px, ver MOBILE_APPOINTMENT_ROW_PADDING)
                  // e o espaço entre as 2 linhas (2->6px, ver
                  // MOBILE_DATE_ROW_MARGIN_TOP) pra chegar em ~85-90px,
                  // sem mexer na largura dos botões nem em mais nada.
                  //
                  // `relative`: contexto de posicionamento do popover do
                  // botão "Retorno" — ver RetornoButton.tsx (`sm:relative`
                  // no wrapper do botão, não mais `relative` sem prefixo)
                  // — SÓ CELULAR o popover passa a ocupar a largura do
                  // CARD (o ancestral `relative` MAIS PRÓXIMO), não mais
                  // a largura pequena do botão. Em desktop isso não muda
                  // nada: o wrapper do botão (mais próximo que o card, já
                  // que fica DENTRO dele) volta a ser `sm:relative`, então
                  // o popover ancora nele primeiro, igual sempre foi —
                  // `relative` aqui no card fica inofensivo (sem
                  // top/left/etc., só estabelece o contexto, sem mudar a
                  // posição do próprio card no layout).
                  className={`relative flex w-full items-center justify-between ${MOBILE_APPOINTMENT_ACTION_GAP} rounded-lg border border-vexo-border bg-vexo-surface ${MOBILE_APPOINTMENT_ROW_PADDING} ${MOBILE_CARD_MIN_HEIGHT}`}
                >
                  <div className={`flex min-w-0 flex-1 items-center ${MOBILE_ROW_GAP}`}>
                    <LeadAvatar profilePictureUrl={a.lead?.profilePictureUrl} name={primary} size="md" />
                    <div className="min-w-0 flex-1">
                      {/* Nome como elemento principal, @ do Instagram como
                          secundário — ver histórico do formato em
                          lead-display.ts. AJUSTE (2026-10-29, 3ª rodada):
                          nome e @ numa linha SÓ (pedido explícito), com
                          reticências se não couber — nome como flex-1
                          (prioridade: encolhe por último) e @ com teto de
                          40% da linha (MOBILE_APPOINTMENT_HANDLE_CAP) pra
                          um @ incomumente longo não tomar a linha inteira
                          e deixar só 1-2 letras pro nome. Deixou de
                          empilhar (2 linhas) — igual desktop já era. */}
                      <div className="flex min-w-0 items-baseline gap-[5px]">
                        <p className={`min-w-0 flex-1 truncate ${MOBILE_NAME_TEXT_APPOINTMENT} font-medium`}>{primary}</p>
                        {handle && (
                          <span className={`${MOBILE_APPOINTMENT_HANDLE_CAP} ${MOBILE_HANDLE_TEXT} text-vexo-muted`}>@{handle}</span>
                        )}
                      </div>
                      {/* Data, tag e telefone — AJUSTE (2026-10-29, 3ª
                          rodada): agrupados em 3 blocos atômicos ("data ·",
                          badge, "· telefone") com flex-wrap — cada bloco só
                          quebra pra linha de baixo INTEIRO, nunca deixando
                          um "·" sozinho numa linha (bug visto nesta
                          rodada: separadores soltos como filhos
                          individuais do flex podiam ficar órfãos no ponto
                          de quebra). Normalmente cabe tudo numa linha só;
                          em telas muito estreitas ou com conteúdo mais
                          longo (nome+@ grande, status "Compareceu", botão
                          "Retorno · N dias"), o telefone quebra pra uma
                          3ª linha — ainda dentro da margem de altura
                          medida contra o card de métrica (+15%, ver
                          MOBILE_CARD_MIN_HEIGHT). Link wa.me do telefone
                          inalterado (mesmo comportamento de antes) — ver
                          BUG REAL corrigido historicamente: "inline" aqui
                          (não um <div> de bloco) já limita a área
                          clicável ao próprio texto, sem precisar de
                          inline-flex. */}
                      <div
                        className={`${MOBILE_DATE_ROW_MARGIN_TOP} flex flex-wrap items-center ${MOBILE_DATE_ROW_GAP} ${MOBILE_APPOINTMENT_SECONDARY_TEXT} text-vexo-muted`}
                      >
                        <span className="shrink-0">
                          {a.scheduledAt.toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                          ·
                        </span>
                        <AppointmentStatusBadge status={appointmentDisplayStatus(a, now)} compact />
                        {a.lead?.phone && (
                          <span className="inline-flex shrink-0 items-center gap-[4px]">
                            <span>·</span>
                            <a
                              href={`https://wa.me/${normalizeBrazilianWhatsappNumber(a.lead.phone)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-vexo-accent hover:underline"
                            >
                              {a.lead.phone}
                            </a>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-[4px]">
                    {/* Botão "Retorno" (item 2 do pedido) — agendamento já
                        passado (status derivado COMPLETED — ver
                        appointmentDisplayStatus, metrics.ts, mesmo cálculo
                        do badge de status da linha), com lead vinculado
                        (sem Lead, não tem quem reativar). SEMPRE visível
                        nesse caso, mesmo já marcado — vira só "travado"
                        depois de enviado (ver lockedReturnPeriodAppointmentIds).
                        AJUSTE (2026-10-29, 3ª rodada): volta a ficar do
                        lado do conteúdo em QUALQUER tamanho de tela — a
                        "linha própria embaixo" da rodada anterior foi
                        revertida (pedido explícito: "nunca em linha
                        própria embaixo").
                        CORREÇÃO (2026-10-29, 4ª rodada — achado na
                        validação ao vivo desta rodada): os dois botões
                        PODEM aparecer juntos sim — displayStatus
                        "COMPLETED" é DERIVADO (status cru SCHEDULED/
                        CONFIRMED + data no passado), mas ACTIONABLE_STATUSES
                        testa o status CRU (`a.status`), que continua
                        "SCHEDULED" até alguém marcar explicitamente —
                        um agendamento vencido e ainda não marcado mostra
                        Retorno E Não compareceu ao mesmo tempo (comentário
                        anterior, que dizia o contrário, estava errado).
                        flex-col aqui (empilha em vez de lado a lado)
                        pra esse caso não espremer o conteúdo contra a
                        parede — sem aumentar a largura de nenhum botão,
                        só reorganiza em até 2 linhas quando os dois
                        aparecem; com só um botão, fica idêntico a antes
                        (flex-col de 1 item só não muda nada visualmente). */}
                    {appointmentDisplayStatus(a, now) === "COMPLETED" && a.leadId && (
                      <RetornoButton
                        appointmentId={a.id}
                        availablePeriods={availableReturnPeriods}
                        returnPeriodDays={a.returnPeriodDays}
                        returnPeriodNone={a.returnPeriodNone}
                        locked={lockedReturnPeriodAppointmentIds.has(a.id)}
                        action={returnPeriodAction}
                      />
                    )}
                    {ACTIONABLE_STATUSES.includes(a.status) && (
                      <NoShowButton appointmentId={a.id} status={a.status} action={noShowAction} />
                    )}
                  </div>
                </div>
                );
              })}

              {appointments.length === 0 && (
                <p className="rounded-lg border border-vexo-border bg-vexo-surface p-4 text-center text-sm text-vexo-muted">
                  Nenhum agendamento ainda.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
