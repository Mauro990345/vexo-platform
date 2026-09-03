import { requireClientSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ensureWhatsappQrForClinic, refreshWhatsappStatus, type WhatsappConnectionState } from "@/lib/whatsapp-connection";
import { WhatsappConnectionPanel } from "@/components/WhatsappConnectionPanel";
import { disconnectWhatsappClientAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function ClientWhatsappPage() {
  const session = await requireClientSession();
  const clinicId = session.user.clinicId as string;

  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { id: clinicId } });

  let status: WhatsappConnectionState = "unknown";
  let statusError: string | null = null;
  try {
    status = await refreshWhatsappStatus(clinicId);
  } catch (err) {
    statusError = err instanceof Error ? err.message : "Erro ao consultar status na Evolution API.";
  }

  let instanceName = clinic.whatsappInstanceName ?? clinic.slug;
  let qrBase64: string | null = null;

  if (status !== "open") {
    try {
      const qr = await ensureWhatsappQrForClinic(clinicId);
      instanceName = qr.instanceName;
      qrBase64 = qr.qrBase64;
    } catch (err) {
      statusError = statusError ?? (err instanceof Error ? err.message : "Erro ao gerar QR code.");
    }
  }

  return (
    <div className="max-w-md space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Conexão do WhatsApp</h1>
      </div>

      <WhatsappConnectionPanel
        instanceName={instanceName}
        status={status}
        qrBase64={qrBase64}
        statusError={statusError}
        refreshHref="/dashboard/whatsapp"
        description='Número que recebe os avisos de "precisa de atendimento humano" da equipe.'
        disconnectAction={disconnectWhatsappClientAction}
      />
    </div>
  );
}
