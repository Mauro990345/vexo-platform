import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireInternalSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ClinicGoogleCalendarPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { status?: string };
}) {
  await requireInternalSession();

  const clinic = await prisma.clinic.findUnique({
    where: { id: params.id },
    include: { googleCalendarAccount: true },
  });
  if (!clinic) notFound();

  const connected = Boolean(clinic.googleCalendarAccount);

  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-lg font-semibold tracking-tight">Conectar Google Calendar</h1>
      <p className="text-sm text-vexo-muted">
        Usado pra IA consultar horários livres e criar os agendamentos confirmados com os leads.
      </p>

      {searchParams.status === "erro" && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
          Falha ao conectar o Google Calendar. Tente novamente.
        </p>
      )}

      <div className="space-y-3 rounded-2xl border border-vexo-border bg-vexo-surface p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-vexo-muted">Google Calendar</h2>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
              connected ? "border-emerald-500/30 text-emerald-300" : "border-vexo-border text-vexo-muted"
            }`}
          >
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${connected ? "bg-emerald-400" : "bg-vexo-muted"}`} />
            {connected ? "Conectado" : "Desconectado"}
          </span>
        </div>

        {connected ? (
          <p className="text-sm">
            Conta conectada: <span className="font-medium">{clinic.googleCalendarAccount!.googleAccountEmail}</span>
          </p>
        ) : (
          <p className="text-sm text-vexo-muted">Nenhuma conta do Google Calendar conectada ainda.</p>
        )}

        <a
          href={`/api/oauth/google-calendar/start?clinicId=${clinic.id}`}
          className="block w-full rounded-lg border border-vexo-accent px-3 py-2 text-center text-sm font-medium text-vexo-accent hover:bg-vexo-accent/10"
        >
          {connected ? "Reconectar" : "Conectar Google Calendar"}
        </a>
      </div>
    </div>
  );
}
