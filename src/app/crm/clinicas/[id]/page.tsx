import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { StatusBadge } from "@/components/StatusBadge";
import { AttendanceToggle } from "@/components/AttendanceToggle";
import {
  updateClinicSettings,
  createClientLogin,
  removeClientLogin,
  logApproach,
  setAppointmentAttendanceAction,
} from "../actions";

export const dynamic = "force-dynamic";

const PIPELINE_ORDER = ["NEW", "IN_CONVERSATION", "SCHEDULED", "FOLLOW_UP", "NEEDS_HUMAN", "LOST"] as const;

export default async function ClinicDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { instagram?: string; calendar?: string };
}) {
  const clinic = await prisma.clinic.findUnique({
    where: { id: params.id },
    include: {
      instagramAccount: true,
      googleCalendarAccount: true,
      reminderConfig: true,
      users: { where: { role: "CLIENT" } },
      conversations: {
        include: {
          lead: true,
          appointments: { orderBy: { scheduledAt: "desc" }, take: 1 },
        },
        orderBy: { lastMessageAt: "desc" },
      },
    },
  });

  if (!clinic) notFound();

  const byStatus = Object.fromEntries(
    PIPELINE_ORDER.map((status) => [status, clinic.conversations.filter((c) => c.status === status)])
  );

  return (
    <div className="space-y-8">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight">{clinic.name}</h1>
          <div className="flex gap-2">
            <a
              href={`/api/oauth/instagram/start?clinicId=${clinic.id}`}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${clinic.instagramAccount ? "border-emerald-500/30 text-emerald-300" : "border-vexo-accent text-vexo-accent"}`}
            >
              {clinic.instagramAccount ? `Instagram: @${clinic.instagramAccount.igUsername ?? "conectado"}` : "Conectar Instagram"}
            </a>
            <a
              href={`/api/oauth/google-calendar/start?clinicId=${clinic.id}`}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${clinic.googleCalendarAccount ? "border-emerald-500/30 text-emerald-300" : "border-vexo-accent text-vexo-accent"}`}
            >
              {clinic.googleCalendarAccount ? `Calendar: ${clinic.googleCalendarAccount.googleAccountEmail}` : "Conectar Google Calendar"}
            </a>
          </div>
        </div>
        {searchParams.instagram === "erro" && (
          <p className="mt-2 text-sm text-red-400">Falha ao conectar o Instagram. Tente novamente.</p>
        )}
        {searchParams.calendar === "erro" && (
          <p className="mt-2 text-sm text-red-400">Falha ao conectar o Google Calendar. Tente novamente.</p>
        )}
      </div>

      <section>
        <h2 className="mb-3 text-sm font-medium text-vexo-muted">Pipeline</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {PIPELINE_ORDER.map((status) => (
            <div key={status} className="rounded-xl border border-vexo-border bg-vexo-surface p-3">
              <div className="mb-2 flex items-center justify-between">
                <StatusBadge status={status} />
                <span className="text-xs text-vexo-muted">{byStatus[status]?.length ?? 0}</span>
              </div>
              <div className="space-y-2">
                {byStatus[status]?.slice(0, 8).map((conv) => {
                  const appt = conv.appointments[0];
                  return (
                    <div key={conv.id} className="rounded-lg border border-vexo-border bg-vexo-bg p-2 text-xs">
                      <Link href={`/crm/conversas/${conv.id}`} className="block transition hover:text-vexo-accent">
                        <p className="font-medium">{conv.lead.name ?? conv.lead.igUsername ?? "Lead"}</p>
                        <p className="mt-0.5 text-vexo-muted">
                          {conv.lastMessageAt
                            ? new Date(conv.lastMessageAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                            : "—"}
                        </p>
                      </Link>

                      {appt && (
                        <div className="mt-2 border-t border-vexo-border pt-2">
                          <p className="mb-1.5 font-medium">
                            {appt.scheduledAt.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          </p>
                          <AttendanceToggle appointmentId={appt.id} status={appt.status} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <form
          action={updateClinicSettings.bind(null, clinic.id)}
          className="space-y-4 rounded-xl border border-vexo-border bg-vexo-surface p-5"
        >
          <h2 className="text-sm font-medium text-vexo-muted">Configuração</h2>

          <div>
            <label className="mb-1.5 block text-sm" htmlFor="aiSystemPrompt">
              Prompt de conversação da IA
            </label>
            <textarea
              id="aiSystemPrompt"
              name="aiSystemPrompt"
              rows={8}
              defaultValue={clinic.aiSystemPrompt ?? ""}
              placeholder="Cole aqui o prompt fornecido pelo Mauro para esta clínica..."
              className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-3 py-2 font-mono text-xs outline-none focus:border-vexo-accent"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm" htmlFor="welcomeVideoUrl">
              URL do vídeo de boas-vindas (primeiro atendimento)
            </label>
            <input
              id="welcomeVideoUrl"
              name="welcomeVideoUrl"
              defaultValue={clinic.welcomeVideoUrl ?? ""}
              placeholder="https://..."
              className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-3 py-2 text-sm outline-none focus:border-vexo-accent"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm" htmlFor="notifyWhatsappNumber">
              WhatsApp para alertas de escalonamento (Mauro/secretária)
            </label>
            <input
              id="notifyWhatsappNumber"
              name="notifyWhatsappNumber"
              defaultValue={clinic.notifyWhatsappNumber ?? ""}
              placeholder="+55 11 99999-9999"
              className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-3 py-2 text-sm outline-none focus:border-vexo-accent"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm" htmlFor="clientWhatsappNumber">
              WhatsApp da clínica (resumo semanal)
            </label>
            <input
              id="clientWhatsappNumber"
              name="clientWhatsappNumber"
              defaultValue={clinic.clientWhatsappNumber ?? ""}
              placeholder="+55 11 99999-9999"
              className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-3 py-2 text-sm outline-none focus:border-vexo-accent"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm" htmlFor="hoursBefore">
              Lembretes (horas antes, separadas por vírgula)
            </label>
            <input
              id="hoursBefore"
              name="hoursBefore"
              defaultValue={(clinic.reminderConfig?.hoursBefore ?? [24, 3]).join(",")}
              className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-3 py-2 text-sm outline-none focus:border-vexo-accent"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={clinic.active} className="rounded border-vexo-border" />
            Clínica ativa
          </label>

          <button
            type="submit"
            className="w-full rounded-lg bg-vexo-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Salvar configuração
          </button>
        </form>

        <div className="space-y-4">
          <form
            action={logApproach.bind(null, clinic.id)}
            className="flex items-end gap-2 rounded-xl border border-vexo-border bg-vexo-surface p-5"
          >
            <div className="flex-1">
              <label className="mb-1.5 block text-sm" htmlFor="count">
                Registrar abordagens de hoje
              </label>
              <input
                id="count"
                name="count"
                type="number"
                min={1}
                required
                placeholder="ex: 25"
                className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-3 py-2 text-sm outline-none focus:border-vexo-accent"
              />
            </div>
            <button className="rounded-lg bg-vexo-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90">
              Registrar
            </button>
          </form>

          <div className="space-y-3 rounded-xl border border-vexo-border bg-vexo-surface p-5">
            <h2 className="text-sm font-medium text-vexo-muted">Contas</h2>
            <p className="text-xs text-vexo-muted">
              Login do painel do cliente — permanente, sem expiração. Revogado removendo o acesso
              abaixo.
            </p>

            {clinic.users.length > 0 && (
              <ul className="divide-y divide-vexo-border rounded-lg border border-vexo-border">
                {clinic.users.map((u) => (
                  <li key={u.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div>
                      <p>{u.name}</p>
                      <p className="text-xs text-vexo-muted">{u.email}</p>
                    </div>
                    <form action={removeClientLogin.bind(null, clinic.id, u.id)}>
                      <button className="rounded-md border border-vexo-border px-2 py-1 text-xs text-red-400 hover:border-red-500/40">
                        Remover acesso
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}

            <form action={createClientLogin.bind(null, clinic.id)} className="space-y-2 pt-1">
              <input
                name="name"
                placeholder="Nome do responsável"
                required
                className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-3 py-2 text-sm outline-none focus:border-vexo-accent"
              />
              <input
                name="email"
                type="email"
                placeholder="E-mail"
                required
                className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-3 py-2 text-sm outline-none focus:border-vexo-accent"
              />
              <input
                name="password"
                type="password"
                placeholder="Senha (mín. 8 caracteres)"
                required
                minLength={8}
                className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-3 py-2 text-sm outline-none focus:border-vexo-accent"
              />
              <button
                type="submit"
                className="w-full rounded-lg border border-vexo-border px-3 py-2 text-sm font-medium hover:border-vexo-accent"
              >
                Criar acesso
              </button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
