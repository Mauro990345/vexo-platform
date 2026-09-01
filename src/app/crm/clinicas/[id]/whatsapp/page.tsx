import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireInternalSession } from "@/lib/session";
import { ensureWhatsappQrForClinic, refreshWhatsappStatus, type WhatsappConnectionState } from "@/lib/whatsapp-connection";
import { WhatsappConnectionPanel } from "@/components/WhatsappConnectionPanel";
import { disconnectWhatsappAction, renameWhatsappInstanceAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function ClinicWhatsappPage({ params }: { params: { id: string } }) {
  await requireInternalSession();

  const clinic = await prisma.clinic.findUnique({ where: { id: params.id } });
  if (!clinic) notFound();

  let status: WhatsappConnectionState = "unknown";
  let statusError: string | null = null;
  try {
    status = await refreshWhatsappStatus(clinic.id);
  } catch (err) {
    statusError = err instanceof Error ? err.message : "Erro ao consultar status na Evolution API.";
  }

  let instanceName = clinic.whatsappInstanceName ?? clinic.slug;
  let qrBase64: string | null = null;

  // QR expira em segundos — só busca (e só falha visivelmente) quando ainda
  // não está conectado; já conectado não precisa de QR nenhum.
  if (status !== "open") {
    try {
      const qr = await ensureWhatsappQrForClinic(clinic.id);
      instanceName = qr.instanceName;
      qrBase64 = qr.qrBase64;
    } catch (err) {
      statusError = statusError ?? (err instanceof Error ? err.message : "Erro ao gerar QR code.");
    }
  }

  return (
    <div className="max-w-md space-y-4">
      <Link href={`/crm/clinicas/${clinic.id}`} className="text-xs text-vexo-muted hover:text-vexo-fg">
        ← {clinic.name}
      </Link>
      <h1 className="text-lg font-semibold tracking-tight">Conectar WhatsApp</h1>
      <p className="text-sm text-vexo-muted">
        Usado para notificar a secretária quando um lead precisa de atendimento humano.
      </p>

      <WhatsappConnectionPanel
        instanceName={instanceName}
        status={status}
        qrBase64={qrBase64}
        statusError={statusError}
        refreshHref={`/crm/clinicas/${clinic.id}/whatsapp`}
        disconnectAction={disconnectWhatsappAction.bind(null, clinic.id)}
        renameAction={renameWhatsappInstanceAction.bind(null, clinic.id)}
      />
    </div>
  );
}
