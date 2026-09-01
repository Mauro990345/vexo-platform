import { prisma } from "@/lib/prisma";
import {
  createWhatsappInstance,
  fetchWhatsappConnectionState,
  fetchWhatsappQr,
  logoutWhatsappInstance,
  type WhatsappConnectionState,
} from "@/lib/whatsapp-instance";

export type { WhatsappConnectionState };

// Camada de negócio entre o pipeline/telas e a Evolution API: decide qual
// nome de instância usar por clínica e mantém o último status conhecido no
// banco (Clinic.whatsappStatus) — não é um valor "live", só reflete a
// última vez que alguém abriu a tela de conexão ou clicou em "verificar".

async function ensureInstanceName(clinicId: string): Promise<string> {
  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { id: clinicId } });
  if (clinic.whatsappInstanceName) return clinic.whatsappInstanceName;

  await prisma.clinic.update({
    where: { id: clinicId },
    data: { whatsappInstanceName: clinic.slug },
  });
  return clinic.slug;
}

export async function refreshWhatsappStatus(clinicId: string): Promise<WhatsappConnectionState> {
  const instanceName = await ensureInstanceName(clinicId);
  const state = await fetchWhatsappConnectionState(instanceName);

  await prisma.clinic.update({
    where: { id: clinicId },
    data: { whatsappStatus: state, whatsappStatusCheckedAt: new Date() },
  });

  return state;
}

export async function ensureWhatsappQrForClinic(
  clinicId: string
): Promise<{ instanceName: string; qrBase64: string | null; pairingCode: string | null }> {
  const instanceName = await ensureInstanceName(clinicId);

  await createWhatsappInstance(instanceName);
  const qr = await fetchWhatsappQr(instanceName);

  return { instanceName, ...qr };
}

// Renomear só é permitido antes de conectar (ver telas) — evita ficar com
// o número pareado numa instância e o banco apontando pra outra.
export async function renameWhatsappInstance(clinicId: string, newName: string): Promise<void> {
  const trimmed = newName.trim();
  if (!trimmed) throw new Error("Nome da instância não pode ser vazio.");
  if (!/^[a-z0-9-]+$/.test(trimmed)) {
    throw new Error("Use apenas letras minúsculas, números e hífen no nome da instância.");
  }

  await prisma.clinic.update({
    where: { id: clinicId },
    data: { whatsappInstanceName: trimmed, whatsappStatus: null, whatsappStatusCheckedAt: null },
  });
}

export async function disconnectWhatsapp(clinicId: string): Promise<void> {
  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { id: clinicId } });
  if (!clinic.whatsappInstanceName) return;

  await logoutWhatsappInstance(clinic.whatsappInstanceName);

  await prisma.clinic.update({
    where: { id: clinicId },
    data: { whatsappStatus: "close", whatsappStatusCheckedAt: new Date() },
  });
}
