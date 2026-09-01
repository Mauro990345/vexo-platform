"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireInternalSession } from "@/lib/session";
import { setAppointmentAttendance } from "@/lib/appointments";
import { disconnectWhatsapp, renameWhatsappInstance } from "@/lib/whatsapp-connection";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function createClinic(formData: FormData) {
  await requireInternalSession();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Nome da clínica é obrigatório.");

  const slug = slugify(name) + "-" + Math.random().toString(36).slice(2, 6);

  const clinic = await prisma.clinic.create({
    data: {
      name,
      slug,
      // Nome padrão da instância na Evolution API — pode ser trocado antes
      // do primeiro pareamento em /crm/clinicas/[id]/whatsapp (ex. pra
      // reaproveitar uma instância já validada).
      whatsappInstanceName: slug,
      pilotStartedAt: new Date(),
      pilotEndsAt: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
      reminderConfig: { create: { hoursBefore: [24, 3] } },
    },
  });

  revalidatePath("/crm");
  redirect(`/crm/clinicas/${clinic.id}`);
}

export async function updateClinicSettings(clinicId: string, formData: FormData) {
  await requireInternalSession();

  const aiSystemPrompt = String(formData.get("aiSystemPrompt") ?? "").trim() || null;
  const welcomeVideoUrl = String(formData.get("welcomeVideoUrl") ?? "").trim() || null;
  const notifyWhatsappNumber = String(formData.get("notifyWhatsappNumber") ?? "").trim() || null;
  const clientWhatsappNumber = String(formData.get("clientWhatsappNumber") ?? "").trim() || null;
  const active = formData.get("active") === "on";
  const hoursBeforeRaw = String(formData.get("hoursBefore") ?? "24,3");
  const hoursBefore = hoursBeforeRaw
    .split(",")
    .map((v) => parseInt(v.trim(), 10))
    .filter((v) => !Number.isNaN(v) && v > 0);

  await prisma.clinic.update({
    where: { id: clinicId },
    data: {
      aiSystemPrompt,
      welcomeVideoUrl,
      notifyWhatsappNumber,
      clientWhatsappNumber,
      active,
      reminderConfig: {
        upsert: {
          create: { hoursBefore: hoursBefore.length ? hoursBefore : [24, 3] },
          update: { hoursBefore: hoursBefore.length ? hoursBefore : [24, 3] },
        },
      },
    },
  });

  revalidatePath(`/crm/clinicas/${clinicId}`);
}

export async function createClientLogin(clinicId: string, formData: FormData) {
  await requireInternalSession();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !name || password.length < 8) {
    throw new Error("Preencha nome, e-mail e senha (mín. 8 caracteres).");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.create({
    data: { email, name, passwordHash, role: "CLIENT", clinicId },
  });

  revalidatePath(`/crm/clinicas/${clinicId}`);
}

export async function removeClientLogin(clinicId: string, userId: string) {
  await requireInternalSession();

  // Só remove se o usuário realmente pertencer a essa clínica e for CLIENT —
  // evita que o formulário seja usado pra apagar qualquer usuário por id.
  await prisma.user.deleteMany({ where: { id: userId, clinicId, role: "CLIENT" } });

  revalidatePath(`/crm/clinicas/${clinicId}`);
}

export async function setConversationStatus(
  conversationId: string,
  status: "IN_CONVERSATION" | "LOST" | "FOLLOW_UP"
) {
  await requireInternalSession();

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { status, ...(status === "IN_CONVERSATION" ? { needsHumanReason: null } : {}) },
  });

  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
  });
  revalidatePath(`/crm/conversas/${conversationId}`);
  revalidatePath(`/crm/clinicas/${conversation.clinicId}`);
}

// Chave de comparecimento — a única coisa que a secretária precisa fazer na
// plataforma no dia a dia — por isso fica exposta direto no card do
// agendamento (pipeline e tela da conversa), nunca atrás de configuração.
// Reversível: clicar na opção já marcada desmarca; clicar na outra troca
// direto.
export async function setAppointmentAttendanceAction(
  appointmentId: string,
  status: "COMPLETED" | "NO_SHOW"
) {
  await requireInternalSession();
  const appt = await setAppointmentAttendance(appointmentId, status);
  if (appt) {
    revalidatePath(`/crm/clinicas/${appt.clinicId}`);
    revalidatePath(`/crm/conversas/${appt.conversationId}`);
  }
}

export async function logApproach(clinicId: string, formData: FormData) {
  await requireInternalSession();

  const count = parseInt(String(formData.get("count") ?? "0"), 10);
  if (!count || count <= 0) throw new Error("Informe um número de abordagens maior que zero.");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await prisma.approachLog.create({
    data: { clinicId, loggedDate: today, count },
  });

  revalidatePath(`/crm/clinicas/${clinicId}`);
}

export async function renameWhatsappInstanceAction(clinicId: string, formData: FormData) {
  await requireInternalSession();
  const instanceName = String(formData.get("instanceName") ?? "");
  await renameWhatsappInstance(clinicId, instanceName);
  revalidatePath(`/crm/clinicas/${clinicId}/whatsapp`);
}

export async function disconnectWhatsappAction(clinicId: string) {
  await requireInternalSession();
  await disconnectWhatsapp(clinicId);
  revalidatePath(`/crm/clinicas/${clinicId}/whatsapp`);
  revalidatePath(`/crm/clinicas/${clinicId}`);
  revalidatePath("/crm");
}

export async function sendHumanReply(conversationId: string, formData: FormData) {
  await requireInternalSession();

  const content = String(formData.get("content") ?? "").trim();
  if (!content) return;

  await prisma.message.create({
    data: {
      conversationId,
      direction: "OUTBOUND",
      sender: "HUMAN",
      content,
      status: "PENDING",
      scheduledFor: new Date(),
    },
  });

  revalidatePath(`/crm/conversas/${conversationId}`);
}
