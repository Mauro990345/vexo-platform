import Link from "next/link";
import { notFound } from "next/navigation";
import { MoreHorizontal, UserPlus, MessageCircle, CalendarDays, CheckCircle2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { ResponseRateRing } from "@/components/ResponseRateRing";
import { ColorBadge, type BadgeColor } from "@/components/ColorBadge";
import { startOfDay, addDays } from "@/lib/metrics";

export const dynamic = "force-dynamic";

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

type PipelineStatus = (typeof PIPELINE_COLUMNS)[number]["status"];

// Tom por status do card de lead + cabeçalho em pílula da coluna. bg/pillBg
// usam os tokens de página (vexo-pipelineCol*, ver
// src/lib/page-style-overrides.ts) — editáveis um por um em Configurações,
// já nascendo sutis/dessaturados. tagBg precisa ser uma classe Tailwind
// TOTALMENTE literal (não montada por template string em runtime) pro JIT
// conseguir achá-la por análise estática do arquivo — por isso não dá pra
// derivar `${pillBg}/25` na hora de usar, tem que vir pronta daqui.
// "Precisa de humano"/"Perdido" não têm campo próprio (só as 4 colunas
// citadas pelo usuário) — usam o token antigo (pipelineCardBg, ainda
// editável) + a cor semântica já existente pro resto.
function columnTint(status: PipelineStatus): {
  bg: string;
  pillBg: string;
  pillText: string;
  tagBg: string;
  tagText: string;
} {
  switch (status) {
    case "NEW":
      return {
        bg: "bg-vexo-pipelineColNewBg",
        pillBg: "bg-vexo-pipelineColNewPill",
        pillText: "text-vexo-fg",
        tagBg: "bg-vexo-pipelineColNewPill/25",
        tagText: "text-vexo-fg",
      };
    case "IN_CONVERSATION":
      return {
        bg: "bg-vexo-pipelineColConversationBg",
        pillBg: "bg-vexo-pipelineColConversationPill",
        pillText: "text-vexo-fg",
        tagBg: "bg-vexo-pipelineColConversationPill/25",
        tagText: "text-vexo-fg",
      };
    case "SCHEDULED":
      return {
        bg: "bg-vexo-pipelineColScheduledBg",
        pillBg: "bg-vexo-pipelineColScheduledPill",
        pillText: "text-vexo-fg",
        tagBg: "bg-vexo-pipelineColScheduledPill/25",
        tagText: "text-vexo-fg",
      };
    case "FOLLOW_UP":
      return {
        bg: "bg-vexo-pipelineColFollowupBg",
        pillBg: "bg-vexo-pipelineColFollowupPill",
        pillText: "text-vexo-fg",
        tagBg: "bg-vexo-pipelineColFollowupPill/25",
        tagText: "text-vexo-fg",
      };
    case "NEEDS_HUMAN":
      return {
        bg: "bg-vexo-pipelineCardBg",
        pillBg: "bg-vexo-error/20",
        pillText: "text-vexo-error",
        tagBg: "bg-vexo-error/15",
        tagText: "text-vexo-error",
      };
    case "LOST":
      return {
        bg: "bg-vexo-pipelineCardBg",
        pillBg: "bg-vexo-border",
        pillText: "text-vexo-muted",
        tagBg: "bg-vexo-border/60",
        tagText: "text-vexo-muted",
      };
  }
}

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
          por isso não mudam junto. Fundo de cada card reaproveita o MESMO
          tom da coluna que ele resume (Novos contatos/Taxa de resposta ~
          Novo contato/Em conversa; Agendados/Taxa de comparecimento ~
          Agendado) — mesma lógica de tom por status pedida pros cards de
          lead, só que aqui os 4 tokens já existiam, não precisou de novo
          campo em Configurações. Borda fina/baixa opacidade e raio pequeno
          (rounded-card) — objetivo é elegância, não quantidade de
          elementos. */}
      <div className="grid grid-cols-2 items-stretch gap-3 text-vexo-pipelineHeaderFont sm:grid-cols-4">
        <div className="flex items-center gap-2.5 rounded-card border border-vexo-border/20 bg-vexo-pipelineColNewBg px-2.5 py-1.5">
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
        <div className="flex items-center gap-2.5 rounded-card border border-vexo-border/20 bg-vexo-pipelineColConversationBg px-2.5 py-1.5">
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
        <div className="flex items-center gap-2.5 rounded-card border border-vexo-border/20 bg-vexo-pipelineColScheduledBg px-2.5 py-1.5">
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
        <div className="flex items-center gap-2.5 rounded-card border border-vexo-border/20 bg-vexo-pipelineColScheduledBg px-2.5 py-1.5">
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
            const tint = columnTint(col.status);
            return (
              <div key={col.status} className="w-64 shrink-0 rounded-card border border-vexo-border/30 bg-vexo-surface p-3">
                {/* Cabeçalho em pílula (fundo colorido + nome + contador no
                    mesmo bloco) em vez de texto solto acima da coluna —
                    bg-black/15 no contador dá contraste em cima de
                    qualquer tom de pílula, sem precisar de um token extra
                    por coluna só pra isso. */}
                <div className={`mb-2.5 flex items-center justify-between gap-2 rounded-card ${tint.pillBg} px-2.5 py-1.5`}>
                  <h2 className={`truncate text-xs font-semibold ${tint.pillText}`}>{col.label}</h2>
                  <span className={`shrink-0 rounded-card bg-black/15 px-1.5 py-0.5 text-caption font-medium ${tint.pillText}`}>
                    {items.length}
                  </span>
                </div>

                <div className="space-y-2">
                  {items.map((conv) => {
                    const appt = conv.appointments[0];
                    const name = conv.lead.name ?? conv.lead.igUsername ?? "Lead";
                    const cardClass = `rounded-card border border-vexo-border/20 ${tint.bg} px-3.5 py-2.5`;

                    // A coluna Agendado troca a segunda linha (data do
                    // agendamento em vez de última mensagem) — resto do
                    // card (nome, etiqueta de status) é igual às outras.
                    if (col.status === "SCHEDULED") {
                      return (
                        <div key={conv.id} className={cardClass}>
                          <Link href={`/crm/conversas/${conv.id}`} className="block transition hover:text-vexo-accent">
                            <p className="truncate text-sm font-medium">{name}</p>
                            {appt && (
                              <p className="mt-1 text-caption text-vexo-muted">{formatDateTime(appt.scheduledAt)}</p>
                            )}
                            <span className={`mt-1.5 inline-block rounded-card ${tint.tagBg} px-1.5 py-0.5 text-caption font-medium ${tint.tagText}`}>
                              {col.label}
                            </span>
                          </Link>
                        </div>
                      );
                    }

                    return (
                      <div key={conv.id} className={cardClass}>
                        <Link href={`/crm/conversas/${conv.id}`} className="block transition hover:text-vexo-accent">
                          <div className="flex items-start justify-between gap-2">
                            <p className="truncate text-sm font-medium">{name}</p>
                            <MoreHorizontal className="h-3.5 w-3.5 shrink-0 text-vexo-muted" strokeWidth={2} />
                          </div>
                          <p className="mt-1 text-caption text-vexo-muted">
                            {conv.lastMessageAt ? formatDateTime(conv.lastMessageAt) : "—"}
                          </p>
                          <span className={`mt-1.5 inline-block rounded-card ${tint.tagBg} px-1.5 py-0.5 text-caption font-medium ${tint.tagText}`}>
                            {col.label}
                          </span>
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
