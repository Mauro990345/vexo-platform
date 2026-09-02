import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireInternalSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ClinicInstagramPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { status?: string };
}) {
  await requireInternalSession();

  const clinic = await prisma.clinic.findUnique({
    where: { id: params.id },
    include: { instagramAccount: true },
  });
  if (!clinic) notFound();

  const connected = Boolean(clinic.instagramAccount);

  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-lg font-semibold tracking-tight">Conectar Instagram</h1>
      <p className="text-sm text-vexo-muted">
        Canal onde a IA conversa com os leads da clínica — mensagens recebidas no Direct viram
        atendimento automático.
      </p>

      {searchParams.status === "erro" && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
          Falha ao conectar o Instagram. Tente novamente.
        </p>
      )}

      <div className="space-y-4 rounded-2xl border border-vexo-border bg-vexo-surface p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-vexo-muted">Instagram</h2>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
              connected ? "border-emerald-500/30 text-emerald-300" : "border-vexo-border text-vexo-muted"
            }`}
          >
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${connected ? "bg-emerald-400" : "bg-vexo-muted"}`} />
            {connected ? "Conectado" : "Desconectado"}
          </span>
        </div>

        {connected ? (
          <p className="text-sm">
            Conta conectada: <span className="font-medium">@{clinic.instagramAccount!.igUsername ?? "conectado"}</span>
          </p>
        ) : (
          <p className="text-sm text-vexo-muted">Nenhuma conta do Instagram conectada ainda.</p>
        )}

        <a
          href={`/api/oauth/instagram/start?clinicId=${clinic.id}`}
          className="block w-full rounded-lg border border-vexo-accent px-3 py-2 text-center text-sm font-medium text-vexo-accent hover:bg-vexo-accent/10"
        >
          {connected ? "Reconectar" : "Conectar Instagram"}
        </a>
      </div>
    </div>
  );
}
