import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireInternalSession } from "@/lib/session";
import {
  updateClinicSettings,
  createClientLogin,
  removeClientLogin,
  logApproach,
} from "../../actions";

export const dynamic = "force-dynamic";

export default async function ClinicAutomationPage({ params }: { params: { id: string } }) {
  await requireInternalSession();

  const clinic = await prisma.clinic.findUnique({
    where: { id: params.id },
    include: { reminderConfig: true, users: { where: { role: "CLIENT" } } },
  });
  if (!clinic) notFound();

  return (
    <div className="max-w-3xl space-y-2.5">
      <h1 className="text-base font-semibold tracking-tight">Automações</h1>

      <div className="grid gap-3 lg:grid-cols-2">
        <form
          action={updateClinicSettings.bind(null, clinic.id)}
          className="space-y-3 rounded-xl border border-vexo-border bg-vexo-surface p-3.5"
        >
          <h2 className="text-sm font-medium text-vexo-muted">Configuração</h2>

          <div>
            <label className="mb-1 block text-xs" htmlFor="aiSystemPrompt">
              Prompt de conversação da IA
            </label>
            <textarea
              id="aiSystemPrompt"
              name="aiSystemPrompt"
              rows={8}
              defaultValue={clinic.aiSystemPrompt ?? ""}
              placeholder="Cole aqui o prompt fornecido pelo Mauro para esta clínica..."
              className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 font-mono text-[11px] outline-none focus:border-vexo-accent"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs" htmlFor="welcomeVideoUrl">
              URL do vídeo de boas-vindas (primeiro atendimento)
            </label>
            <input
              id="welcomeVideoUrl"
              name="welcomeVideoUrl"
              defaultValue={clinic.welcomeVideoUrl ?? ""}
              placeholder="https://..."
              className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs" htmlFor="notifyWhatsappNumber">
              WhatsApp para alertas de escalonamento (Mauro/secretária)
            </label>
            <input
              id="notifyWhatsappNumber"
              name="notifyWhatsappNumber"
              defaultValue={clinic.notifyWhatsappNumber ?? ""}
              placeholder="+55 11 99999-9999"
              className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs" htmlFor="clientWhatsappNumber">
              WhatsApp da clínica (resumo semanal)
            </label>
            <input
              id="clientWhatsappNumber"
              name="clientWhatsappNumber"
              defaultValue={clinic.clientWhatsappNumber ?? ""}
              placeholder="+55 11 99999-9999"
              className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs" htmlFor="hoursBefore">
              Lembretes (horas antes, separadas por vírgula)
            </label>
            <input
              id="hoursBefore"
              name="hoursBefore"
              defaultValue={(clinic.reminderConfig?.hoursBefore ?? [24, 3]).join(",")}
              className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
            />
          </div>

          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" name="active" defaultChecked={clinic.active} className="rounded border-vexo-border" />
            Clínica ativa
          </label>

          <button
            type="submit"
            className="w-full rounded-lg bg-vexo-accent px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-90"
          >
            Salvar configuração
          </button>
        </form>

        <div className="space-y-3">
          <form
            action={logApproach.bind(null, clinic.id)}
            className="flex items-end gap-2 rounded-xl border border-vexo-border bg-vexo-surface p-3.5"
          >
            <div className="flex-1">
              <label className="mb-1 block text-xs" htmlFor="count">
                Registrar abordagens de hoje
              </label>
              <input
                id="count"
                name="count"
                type="number"
                min={1}
                required
                placeholder="ex: 25"
                className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
              />
            </div>
            <button className="rounded-lg bg-vexo-accent px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-90">
              Registrar
            </button>
          </form>

          <div className="space-y-2.5 rounded-xl border border-vexo-border bg-vexo-surface p-3.5">
            <h2 className="text-sm font-medium text-vexo-muted">Contas</h2>
            <p className="text-[11px] text-vexo-muted">
              Login do painel do cliente — permanente, sem expiração. Revogado removendo o acesso
              abaixo.
            </p>

            {clinic.users.length > 0 && (
              <ul className="divide-y divide-vexo-border rounded-lg border border-vexo-border">
                {clinic.users.map((u) => (
                  <li key={u.id} className="flex items-center justify-between px-2.5 py-1.5 text-xs">
                    <div>
                      <p>{u.name}</p>
                      <p className="text-[11px] text-vexo-muted">{u.email}</p>
                    </div>
                    <form action={removeClientLogin.bind(null, clinic.id, u.id)}>
                      <button className="rounded-md border border-vexo-border px-1.5 py-1 text-[11px] text-red-400 hover:border-red-500/40">
                        Remover acesso
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}

            <form action={createClientLogin.bind(null, clinic.id)} className="space-y-1.5 pt-1">
              <input
                name="name"
                placeholder="Nome do responsável"
                required
                className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
              />
              <input
                name="email"
                type="email"
                placeholder="E-mail"
                required
                className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
              />
              <input
                name="password"
                type="password"
                placeholder="Senha (mín. 8 caracteres)"
                required
                minLength={8}
                className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
              />
              <button
                type="submit"
                className="w-full rounded-lg border border-vexo-border px-2.5 py-1.5 text-xs font-medium hover:border-vexo-accent"
              >
                Criar acesso
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
