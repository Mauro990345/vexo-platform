import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireInternalSession } from "@/lib/session";
import { updateClinicSettings, logApproach } from "../../actions";

export const dynamic = "force-dynamic";

export default async function ClinicAutomationPage({ params }: { params: { id: string } }) {
  await requireInternalSession();

  const clinic = await prisma.clinic.findUnique({
    where: { id: params.id },
    include: { reminderConfig: true },
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
            <p className="mt-1 text-caption text-vexo-muted">
              Número que recebe o resumo semanal de atendimentos por WhatsApp, toda sexta-feira.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="mb-1 block text-xs" htmlFor="firstReminderHours">
                1º lembrete: horas antes
              </label>
              <input
                id="firstReminderHours"
                name="firstReminderHours"
                type="number"
                min={1}
                required
                defaultValue={clinic.reminderConfig?.hoursBefore?.[0] ?? 24}
                className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
              />
              <p className="mt-1 text-caption text-vexo-muted">
                Quantas horas antes do horário agendado o 1º lembrete é enviado ao lead.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs" htmlFor="secondReminderHours">
                2º lembrete: horas antes
              </label>
              <input
                id="secondReminderHours"
                name="secondReminderHours"
                type="number"
                min={1}
                required
                defaultValue={clinic.reminderConfig?.hoursBefore?.[1] ?? 3}
                className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
              />
              <p className="mt-1 text-caption text-vexo-muted">
                Quantas horas antes do horário agendado o 2º lembrete é enviado ao lead.
              </p>
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" name="active" defaultChecked={clinic.active} className="rounded border-vexo-border" />
              Clínica ativa
            </label>
            <p className="mt-1 text-caption text-vexo-muted">
              Mostra a clínica como ativa (bolinha verde) ou inativa (cinza) na lista de Contas e no
              Painel.
            </p>
          </div>

          <button
            type="submit"
            className="rounded-lg border border-vexo-accent px-2.5 py-1.5 text-xs font-medium text-vexo-accent hover:bg-vexo-accent/10"
          >
            Salvar configuração
          </button>
        </form>

        <form
          action={logApproach.bind(null, clinic.id)}
          className="flex h-fit flex-col gap-2 rounded-xl border border-vexo-border bg-vexo-surface p-3.5"
        >
          <div>
            <label className="mb-1 block text-xs" htmlFor="count">
              Registrar abordagens de hoje
            </label>
            <p className="mb-1.5 text-caption text-vexo-muted">
              Registre manualmente quantas pessoas você abordou hoje, caso o sistema ainda não
              capture isso automaticamente pelo Instagram.
            </p>
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
          <button className="self-start rounded-lg bg-vexo-accent px-2.5 py-1.5 text-xs font-medium text-vexo-accentFg hover:opacity-90">
            Registrar
          </button>
        </form>
      </div>
    </div>
  );
}
