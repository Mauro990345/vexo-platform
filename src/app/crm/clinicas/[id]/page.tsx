import Link from "next/link";
import { notFound } from "next/navigation";
import { MoreHorizontal, UserPlus, MessageCircle, CalendarDays, CheckCircle2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { ResponseRateRing } from "@/components/ResponseRateRing";
import { ColorBadge, type BadgeColor } from "@/components/ColorBadge";
import { startOfDay, addDays } from "@/lib/metrics";

export const dynamic = "force-dynamic";

// Tom compartilhado pela faixa de métricas do topo E pelo cabeçalho de
// cada coluna do board — mais escuro que o antigo bg-vexo-surface2, uma
// constante só pra garantir que os dois lugares usem exatamente a mesma
// cor (em vez de duas classes iguais escritas separadamente e correndo o
// risco de desalinhar numa mudança futura).
const PIPELINE_HEADER_BG = "bg-vexo-surface";

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
// derivar `${pillBg}/opacidade` na hora de usar, tem que vir pronta daqui.
// O cabeçalho da coluna (nome + contador) usa PIPELINE_HEADER_BG pra todo
// mundo — mesmo tom neutro da faixa de métricas do topo, não mais uma cor
// por coluna — então esta função só cuida do fundo do card de lead e da
// etiqueta de status dentro dele. A opacidade de tagBg é deliberadamente
// alta — a etiqueta precisa se destacar do fundo do card, não ficar quase
// igual a ele.
// "Precisa de humano"/"Perdido" não têm campo próprio (só as 4 colunas
// citadas pelo usuário) — usam o token antigo (pipelineCardBg, ainda
// editável) + a cor semântica já existente pro resto.
function columnTint(status: PipelineStatus): { bg: string; tagBg: string; tagText: string } {
  switch (status) {
    case "NEW":
      return { bg: "bg-vexo-pipelineColNewBg", tagBg: "bg-vexo-pipelineColNewPill/45", tagText: "text-vexo-fg" };
    case "IN_CONVERSATION":
      return {
        bg: "bg-vexo-pipelineColConversationBg",
        tagBg: "bg-vexo-pipelineColConversationPill/45",
        tagText: "text-vexo-fg",
      };
    case "SCHEDULED":
      return {
        bg: "bg-vexo-pipelineColScheduledBg",
        tagBg: "bg-vexo-pipelineColScheduledPill/45",
        tagText: "text-vexo-fg",
      };
    case "FOLLOW_UP":
      return {
        bg: "bg-vexo-pipelineColFollowupBg",
        tagBg: "bg-vexo-pipelineColFollowupPill/45",
        tagText: "text-vexo-fg",
      };
    case "NEEDS_HUMAN":
      return { bg: "bg-vexo-pipelineCardBg", tagBg: "bg-vexo-error/30", tagText: "text-vexo-error" };
    case "LOST":
      return { bg: "bg-vexo-pipelineCardBg", tagBg: "bg-vexo-border/80", tagText: "text-vexo-muted" };
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

      {/* Uma única faixa escura (bg-vexo-surface — mesmo tom reaproveitado
          no cabeçalho de cada coluna do board mais abaixo, ver
          PIPELINE_HEADER_BG) dividida em 4 seções por um divisor fino
          (divide-x), não mais 4 cards separados com borda própria cada —
          visual de "barra de status", não "blocos empilhados". Padding
          vertical reduzido (py-1) pra faixa ficar mais fina.
          overflow-x-auto é rede de segurança pra telas bem estreitas (a
          faixa não quebra linha; abaixo de min-w cada seção vira scroll
          horizontal em vez de espremer o conteúdo). text-vexo-pipelineHeaderFont
          aqui em cima, não em cada número — color é herdado, então os
          valores (sem cor própria) pegam esse token. Nome de cada métrica
          com destaque "marca-texto" (fundo cinza claro translúcido,
          cantos quase retos — rounded-sm, mais reto que o rounded-card
          usado no resto da página) — só o nome, o valor continua sendo o
          elemento de maior peso visual, sem esse tratamento. */}
      <div className="overflow-x-auto">
        <div className={`flex divide-x divide-vexo-border/20 overflow-hidden rounded-card border border-vexo-border/20 ${PIPELINE_HEADER_BG} text-vexo-pipelineHeaderFont`}>
          <div className="flex min-w-[160px] flex-1 items-center gap-2.5 px-3 py-1">
            <ColorBadge color="accent" size="h-8 w-8">
              <UserPlus className="h-4 w-4" strokeWidth={2} />
            </ColorBadge>
            <div className="min-w-0 flex-1">
              <span className="inline-block max-w-full truncate rounded-sm bg-white/10 px-1.5 py-0.5 text-caption font-normal text-vexo-fg">
                Novos contatos
              </span>
              <div className="mt-1 flex min-w-0 items-baseline gap-1.5">
                <span className="shrink-0 text-lg font-semibold leading-none tracking-tight">{newContacts}</span>
                <span className="min-w-0 flex-1 truncate text-card text-vexo-muted">Últimos 7 dias</span>
              </div>
            </div>
          </div>
          <div className="flex min-w-[160px] flex-1 items-center gap-2.5 px-3 py-1">
            <ColorBadge color="accent" size="h-8 w-8">
              <MessageCircle className="h-4 w-4" strokeWidth={2} />
            </ColorBadge>
            <div className="min-w-0 flex-1">
              <span className="inline-block max-w-full truncate rounded-sm bg-white/10 px-1.5 py-0.5 text-caption font-normal text-vexo-fg">
                Taxa de resposta
              </span>
              <div className="mt-1 flex min-w-0 items-center gap-1.5">
                <ResponseRateRing value={responseRate} compact />
                <span className="min-w-0 flex-1 truncate text-card text-vexo-muted">Novo contato → Em conversa</span>
              </div>
            </div>
          </div>
          <div className="flex min-w-[160px] flex-1 items-center gap-2.5 px-3 py-1">
            <ColorBadge color="success" size="h-8 w-8">
              <CalendarDays className="h-4 w-4" strokeWidth={2} />
            </ColorBadge>
            <div className="min-w-0 flex-1">
              <span className="inline-block max-w-full truncate rounded-sm bg-white/10 px-1.5 py-0.5 text-caption font-normal text-vexo-fg">
                Agendados
              </span>
              <div className="mt-1 flex min-w-0 items-baseline gap-1.5">
                <span className="shrink-0 text-lg font-semibold leading-none tracking-tight">{scheduled}</span>
                <span className="min-w-0 flex-1 truncate text-card text-vexo-muted">Últimos 7 dias</span>
              </div>
            </div>
          </div>
          <div className="flex min-w-[160px] flex-1 items-center gap-2.5 px-3 py-1">
            <ColorBadge color={attendanceRingColor(attendanceRate)} size="h-8 w-8">
              <CheckCircle2 className="h-4 w-4" strokeWidth={2} />
            </ColorBadge>
            <div className="min-w-0 flex-1">
              <span className="inline-block max-w-full truncate rounded-sm bg-white/10 px-1.5 py-0.5 text-caption font-normal text-vexo-fg">
                Taxa de comparecimento
              </span>
              <div className="mt-1 flex min-w-0 items-center gap-1.5">
                <ResponseRateRing value={attendanceRate} color={attendanceRingColor(attendanceRate)} compact />
                <span className="min-w-0 flex-1 truncate text-card text-vexo-muted">Compareceu x Não compareceu</span>
              </div>
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
              <div key={col.status} className="w-64 shrink-0 rounded-card border border-vexo-border/30 bg-vexo-surface2 p-3">
                {/* Cabeçalho compacto (nome + contador no mesmo bloco) em
                    vez de texto solto acima da coluna — usa
                    PIPELINE_HEADER_BG (mesmo tom da faixa de métricas do
                    topo, ver comentário lá) pra TODAS as colunas, não mais
                    uma cor por coluna — o container em volta subiu de
                    bg-vexo-surface pra bg-vexo-surface2 de propósito,
                    senão esse tom mais escuro ficaria idêntico ao fundo
                    logo atrás dele e o cabeçalho sumiria visualmente. A
                    identidade de cor de cada coluna continua vindo do
                    fundo do card de lead + da etiqueta de status dentro
                    dele (ver columnTint), não mais do cabeçalho. */}
                <div className={`mb-2.5 flex items-center justify-between gap-2 rounded-card ${PIPELINE_HEADER_BG} px-2 py-1`}>
                  <h2 className="truncate text-xs font-semibold text-vexo-fg">{col.label}</h2>
                  <span className="shrink-0 rounded-card bg-black/15 px-1.5 py-0.5 text-caption font-medium text-vexo-fg">
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
                            <p className="truncate text-sm font-normal">{name}</p>
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
                            <p className="truncate text-sm font-normal">{name}</p>
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
