import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle, AtSign, Calendar } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireInternalSession } from "@/lib/session";
import { refreshWhatsappStatus, type WhatsappConnectionState } from "@/lib/whatsapp-connection";

export const dynamic = "force-dynamic";

const WHATSAPP_STATUS_LABELS: Record<WhatsappConnectionState, string> = {
  open: "Conectado",
  connecting: "Conectando…",
  close: "Não conectado",
  unknown: "Status desconhecido",
};

const WHATSAPP_STATUS_DOT: Record<WhatsappConnectionState, string> = {
  open: "bg-emerald-400",
  connecting: "bg-amber-400",
  close: "bg-vexo-muted",
  unknown: "bg-vexo-muted",
};

// Card compacto no formato de referência (grid 3 colunas): ícone+nome em
// cima, descrição no meio, status + botão na mesma linha embaixo. O card
// em si não é clicável — só o botão, que leva pra tela dedicada daquele
// canal (a de WhatsApp tem QR code, as outras completam o OAuth ali).
function ConnectionCard({
  icon,
  iconBg,
  name,
  description,
  connected,
  statusLabel,
  statusDot,
  href,
}: {
  icon: React.ReactNode;
  iconBg: string;
  name: string;
  description: string;
  connected: boolean;
  statusLabel: string;
  statusDot: string;
  href: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-vexo-border bg-vexo-surface p-3.5">
      <div className="flex items-center gap-2.5">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${iconBg} text-white`}>
          {icon}
        </span>
        <p className="text-sm font-bold">{name}</p>
      </div>

      <p className="text-xs text-vexo-muted">{description}</p>

      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-vexo-muted">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot}`} />
          <span className="truncate">{statusLabel}</span>
        </div>
        <Link
          href={href}
          className="shrink-0 rounded-lg border border-vexo-accent px-2.5 py-1 text-[11px] font-medium text-vexo-accent hover:bg-vexo-accent/10"
        >
          {connected ? "Gerenciar" : "Conectar"}
        </Link>
      </div>
    </div>
  );
}

export default async function ClinicConexoesPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { status?: string };
}) {
  await requireInternalSession();

  const clinic = await prisma.clinic.findUnique({
    where: { id: params.id },
    include: { instagramAccount: true, googleCalendarAccount: true },
  });
  if (!clinic) notFound();

  let whatsappStatus: WhatsappConnectionState = "unknown";
  try {
    whatsappStatus = await refreshWhatsappStatus(clinic.id);
  } catch {
    whatsappStatus = "unknown";
  }

  const base = `/crm/clinicas/${clinic.id}`;
  const instagramConnected = Boolean(clinic.instagramAccount);
  const googleConnected = Boolean(clinic.googleCalendarAccount);

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-base font-semibold tracking-tight">Conexões</h1>
        <p className="mt-0.5 text-xs text-vexo-muted">
          Canais desta clínica, organizados num só lugar. O status atualiza sozinho conforme cada
          canal conecta ou cai.
        </p>
      </div>

      {searchParams.status === "erro" && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
          Falha ao conectar o Instagram. Tente novamente.
        </p>
      )}

      <div className="grid grid-cols-3 gap-3">
        <ConnectionCard
          icon={<MessageCircle className="h-3.5 w-3.5" strokeWidth={2} />}
          iconBg="bg-emerald-500"
          name="WhatsApp"
          description="Notifica a secretária quando um lead precisa de atendimento humano."
          connected={whatsappStatus === "open"}
          statusLabel={WHATSAPP_STATUS_LABELS[whatsappStatus]}
          statusDot={WHATSAPP_STATUS_DOT[whatsappStatus]}
          href={`${base}/whatsapp`}
        />
        <ConnectionCard
          icon={<AtSign className="h-3.5 w-3.5" strokeWidth={2} />}
          iconBg="bg-pink-500"
          name="Instagram"
          description="Captura no Direct e leva a conversa pra IA."
          connected={instagramConnected}
          statusLabel={
            instagramConnected ? `Conectado · @${clinic.instagramAccount!.igUsername ?? "conectado"}` : "Não conectado"
          }
          statusDot={instagramConnected ? "bg-emerald-400" : "bg-vexo-muted"}
          href={`/api/oauth/instagram/start?clinicId=${clinic.id}`}
        />
        <ConnectionCard
          icon={<Calendar className="h-3.5 w-3.5" strokeWidth={2} />}
          iconBg="bg-blue-500"
          name="Google Calendar"
          description="IA consulta horários livres e cria os agendamentos."
          connected={googleConnected}
          statusLabel={googleConnected ? "Conectado" : "Não conectado"}
          statusDot={googleConnected ? "bg-emerald-400" : "bg-vexo-muted"}
          href={`${base}/google-calendar`}
        />
      </div>
    </div>
  );
}
