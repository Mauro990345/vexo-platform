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
            className="w-full rounded-lg bg-vexo-accent px-2.5 py-1.5 text-xs font-medium text-vexo-accentFg hover:opacity-90"
          >
            Salvar configuração
          </button>
        </form>

        <form
          action={logApproach.bind(null, clinic.id)}
          className="flex h-fit items-end gap-2 rounded-xl border border-vexo-border bg-vexo-surface p-3.5"
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
          <button className="rounded-lg bg-vexo-accent px-2.5 py-1.5 text-xs font-medium text-vexo-accentFg hover:opacity-90">
            Registrar
          </button>
        </form>
      </div>
    </div>
  );
}
