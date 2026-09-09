import Link from "next/link";
import { notFound } from "next/navigation";
import { AtSign, MoreHorizontal, UserPlus, MessageCircle, CalendarDays, CheckCircle2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { ResponseRateRing } from "@/components/ResponseRateRing";
import { ColorBadge, type BadgeColor } from "@/components/ColorBadge";
import { InitialsAvatar } from "@/components/InitialsAvatar";
import { startOfDay, addDays } from "@/lib/metrics";

export const dynamic = "force-dynamic";

// Fundo/borda dos cards de lead — usa os tokens de página
// (vexo-pipelineCardBg/vexo-pipelineCardBorder, ver
// src/lib/page-style-overrides.ts), que por padrão seguem vexoPetrol/
// vexoPetrolBorder (mesma aparência de sempre) mas podem ser
// personalizados só pro Pipeline, sem afetar o card de agendamento da
// Agenda, na tela de Configurações.
//
// Mesma receita do card de agendamento da Agenda: a borda "ambiente" (as 4
// faces) fica em vexo-petrolBorder, sem token de página — só a lateral
// esquerda troca de cor (border-l-vexo-pipelineCardBorder), senão
// personalizar essa cor pintava o contorno inteiro do card, não só a
// faixa da esquerda.
const LEAD_CARD_CLASS =
  "rounded-xl border border-vexo-petrolBorder border-l-[3px] border-l-vexo-pipelineCardBorder bg-vexo-pipelineCardBg";

// Faixas da cor do anel de comparecimento — decisão de exibição, não de
// dado (o número em si vem sempre certo do banco). Ajustável se a clínica
// achar essas faixas erradas pra realidade dela.
function attendanceRingColor(rate: number | null): BadgeColor {
  if (rate === null || rate >= 0.75) return "success";
  if (rate >= 0.5) return "warning";
  return "error";
}

const PIPELINE_COLUMNS = [
  { status: "NEW", label: "Novo contato" },
  { status: "IN_CONVERSATION", label: "Em conversa" },
  { status: "SCHEDULED", label: "Agendado" },
  { status: "FOLLOW_UP", label: "Follow-up" },
  { status: "NEEDS_HUMAN", label: "Precisa de humano" },
  { status: "LOST", label: "Perdido" },
] as const;

function formatDateTime(date: Date): string {
  return new Date(date).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default async function ClinicPipelinePage({ params }: { params: { id: string } }) {
  const clinicId = params.id;
  const todayStart = startOfDay(new Date());
  const periodStart = addDays(todayStart, -6);
  const periodEnd = addDays(todayStart, 1);

  const [clinic, newContacts, responded, scheduled, completed, noShow] = await Promise.all([
    prisma.clinic.findUnique({
      where: { id: clinicId },
      include: {
        conversations: {
          include: {
            lead: true,
            appointments: { orderBy: { scheduledAt: "desc" }, take: 1 },
          },
          orderBy: { lastMessageAt: "desc" },
        },
      },
    }),
    prisma.conversation.count({
      where: { clinicId, createdAt: { gte: periodStart, lt: periodEnd } },
    }),
    prisma.conversation.count({
      where: { clinicId, createdAt: { gte: periodStart, lt: periodEnd }, status: { not: "NEW" } },
    }),
    prisma.appointment.count({
      where: { clinicId, createdAt: { gte: periodStart, lt: periodEnd } },
    }),
    prisma.appointment.count({
      where: { clinicId, scheduledAt: { gte: periodStart, lt: periodEnd }, status: "COMPLETED" },
    }),
    prisma.appointment.count({
      where: { clinicId, scheduledAt: { gte: periodStart, lt: periodEnd }, status: "NO_SHOW" },
    }),
  ]);

  if (!clinic) notFound();

  const responseRate = newContacts > 0 ? responded / newContacts : null;
  const attendanceRate = completed + noShow > 0 ? completed / (completed + noShow) : null;

  const byStatus = Object.fromEntries(
    PIPELINE_COLUMNS.map((col) => [col.status, clinic.conversations.filter((c) => c.status === col.status)])
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Pipeline</h1>
        <p className="mt-1 text-sm text-vexo-muted">{clinic.name}</p>
      </div>

      {/* text-vexo-pipelineHeaderFont aqui em cima, não em cada número —
          color é herdado, então os valores (sem cor própria) pegam esse
          token; os labels/legendas continuam explicitamente vexo-muted,
          por isso não mudam junto. */}
      {/* py-0.5 + valores em text-lg + só 2 linhas (label; valor + legenda
          lado a lado) — de propósito mais compactos que os cards de lead
          dentro das colunas do funil: são um resumo de apoio, não o foco
          principal da tela, então não deveriam competir em peso visual com
          o conteúdo do funil.
          items-stretch explícito (já seria o padrão do grid, mas fica
          garantido) + truncate na legenda de cada card: sem truncate, a
          legenda mais longa ("Compareceu x Não compareceu") podia quebrar
          pra uma segunda linha num card e não nos outros, deixando só
          aquele card mais alto no mobile (grid-cols-2, menos largura por
          card) — com truncate, as 4 legendas ficam sempre em 1 linha,
          então as 4 alturas batem certo em qualquer largura de tela. */}
      <div className="grid grid-cols-2 items-stretch gap-3 text-vexo-pipelineHeaderFont sm:grid-cols-4">
        <div className="flex items-center gap-2.5 rounded-lg border border-vexo-border/50 bg-vexo-surface2 px-2.5 py-1.5">
          <ColorBadge color="accent" size="h-8 w-8">
            <UserPlus className="h-4 w-4" strokeWidth={2} />
          </ColorBadge>
          <div className="min-w-0 flex-1">
            <p className="truncate text-card font-medium text-vexo-muted">Novos contatos</p>
            <div className="mt-0.5 flex min-w-0 items-baseline gap-1.5">
              <span className="shrink-0 text-lg font-semibold leading-none tracking-tight">{newContacts}</span>
              <span className="min-w-0 flex-1 truncate text-card text-vexo-muted">Últimos 7 dias</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2.5 rounded-lg border border-vexo-border/50 bg-vexo-surface2 px-2.5 py-1.5">
          <ColorBadge color="accent" size="h-8 w-8">
            <MessageCircle className="h-4 w-4" strokeWidth={2} />
          </ColorBadge>
          <div className="min-w-0 flex-1">
            <p className="truncate text-card font-medium text-vexo-muted">Taxa de resposta</p>
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
              <ResponseRateRing value={responseRate} compact />
              <span className="min-w-0 flex-1 truncate text-card text-vexo-muted">Novo contato → Em conversa</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2.5 rounded-lg border border-vexo-border/50 bg-vexo-surface2 px-2.5 py-1.5">
          <ColorBadge color="success" size="h-8 w-8">
            <CalendarDays className="h-4 w-4" strokeWidth={2} />
          </ColorBadge>
          <div className="min-w-0 flex-1">
            <p className="truncate text-card font-medium text-vexo-muted">Agendados</p>
            <div className="mt-0.5 flex min-w-0 items-baseline gap-1.5">
              <span className="shrink-0 text-lg font-semibold leading-none tracking-tight">{scheduled}</span>
              <span className="min-w-0 flex-1 truncate text-card text-vexo-muted">Últimos 7 dias</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2.5 rounded-lg border border-vexo-border/50 bg-vexo-surface2 px-2.5 py-1.5">
          <ColorBadge color={attendanceRingColor(attendanceRate)} size="h-8 w-8">
            <CheckCircle2 className="h-4 w-4" strokeWidth={2} />
          </ColorBadge>
          <div className="min-w-0 flex-1">
            <p className="truncate text-card font-medium text-vexo-muted">Taxa de comparecimento</p>
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
              <ResponseRateRing value={attendanceRate} color={attendanceRingColor(attendanceRate)} compact />
              <span className="min-w-0 flex-1 truncate text-card text-vexo-muted">Compareceu x Não compareceu</span>
            </div>
          </div>
        </div>
      </div>

      {/* Board com rolagem horizontal própria (arrasta os cards pros
          lados se as 6 colunas não couberem) — cada coluna só cresce em
          altura conforme o conteúdo, sem scroll vertical próprio; quem
          rola verticalmente é a página toda. */}
      <div className="overflow-x-auto pb-2">
        <div className="flex items-start gap-3">
          {PIPELINE_COLUMNS.map((col) => {
            const items = byStatus[col.status] ?? [];
            return (
              <div key={col.status} className="w-64 shrink-0 rounded-xl border border-vexo-border bg-vexo-surface p-3">
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  {/* text-vexo-fg explícito — antes o título só herdava a
                      cor do body sem nenhuma classe própria, o que deveria
                      já dar o mesmo resultado nas 6 colunas, mas na prática
                      duas apareciam mais apagadas que as outras. Fixando a
                      cor aqui em vez de depender de herança, o título das 6
                      colunas (estados irmãos do mesmo funil) fica garantido
                      igual, independente da causa exata da inconsistência. */}
                  <h2 className="truncate text-xs font-semibold text-vexo-fg">{col.label}</h2>
                  <span className="shrink-0 rounded-full bg-vexo-surface2 px-1.5 py-0.5 text-caption font-medium text-vexo-muted">
                    {items.length}
                  </span>
                </div>

                <div className="space-y-3">
                  {items.map((conv) => {
                    const appt = conv.appointments[0];
                    const name = conv.lead.name ?? conv.lead.igUsername ?? "Lead";

                    // A coluna Agendado usava padding/fonte menores (versão
                    // compacta de quando ainda tinha os botões
                    // "Compareceu"/"Faltou" dentro do card, removidos há
                    // algumas rodadas) — agora usa o mesmo p-3.5 e mesmo
                    // tamanho de texto do nome que as outras 5 colunas, só
                    // trocando a segunda linha (data do agendamento em vez
                    // de @ + última mensagem).
                    if (col.status === "SCHEDULED") {
                      return (
                        <div key={conv.id} className={`${LEAD_CARD_CLASS} px-3.5 py-2.5`}>
                          <Link
                            href={`/crm/conversas/${conv.id}`}
                            className="flex items-center gap-2.5 transition hover:text-vexo-accent"
                          >
                            <InitialsAvatar name={name} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold">{name}</p>
                              {appt && (
                                <p className="mt-1 text-caption font-medium text-vexo-muted">
                                  {formatDateTime(appt.scheduledAt)}
                                </p>
                              )}
                            </div>
                          </Link>
                        </div>
                      );
                    }

                    return (
                      <div key={conv.id} className={`${LEAD_CARD_CLASS} px-3.5 py-2.5`}>
                        <Link
                          href={`/crm/conversas/${conv.id}`}
                          className="flex items-start gap-2.5 transition hover:text-vexo-accent"
                        >
                          <InitialsAvatar name={name} className="mt-0.5 h-7 w-7" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="truncate text-sm font-semibold">{name}</p>
                              <MoreHorizontal className="h-3.5 w-3.5 shrink-0 text-vexo-muted" strokeWidth={2} />
                            </div>

                            <div className="mt-1 flex items-center gap-1.5 text-caption text-vexo-muted">
                              <AtSign className="h-3 w-3 shrink-0" strokeWidth={2} />
                              <span>{conv.lastMessageAt ? formatDateTime(conv.lastMessageAt) : "—"}</span>
                            </div>
                          </div>
                        </Link>
                      </div>
                    );
                  })}

                  {items.length === 0 && (
                    <p className="py-2 text-center text-caption text-vexo-muted">Nenhum lead aqui.</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
