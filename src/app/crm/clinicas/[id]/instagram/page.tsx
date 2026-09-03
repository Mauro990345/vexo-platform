import { notFound } from "next/navigation";
import { AtSign } from "lucide-react";
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
    <div className="max-w-md space-y-3">
      <h1 className="text-base font-semibold tracking-tight">Conectar Instagram</h1>

      {searchParams.status === "erro" && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
          Falha ao conectar o Instagram. Tente novamente.
        </p>
      )}

      <div className="flex items-center gap-3 rounded-xl border border-vexo-border bg-vexo-surface p-3.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-pink-500 text-white">
          <AtSign className="h-3.5 w-3.5" strokeWidth={2} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Instagram</p>
          <p className="truncate text-xs text-vexo-muted">
            Captura no Direct e leva a conversa pra IA.
          </p>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-vexo-muted">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${connected ? "bg-emerald-400" : "bg-vexo-muted"}`} />
            {connected ? `Conectado · @${clinic.instagramAccount!.igUsername ?? "conectado"}` : "Não conectado"}
          </div>
        </div>

        <a
          href={`/api/oauth/instagram/start?clinicId=${clinic.id}`}
          className="shrink-0 rounded-lg border border-vexo-accent px-2.5 py-1.5 text-xs font-medium text-vexo-accent hover:bg-vexo-accent/10"
        >
          {connected ? "Reconectar" : "Conectar"}
        </a>
      </div>
    </div>
  );
}
