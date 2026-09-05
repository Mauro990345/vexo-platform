"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireInternalSession } from "@/lib/session";
import { setAppointmentAttendance } from "@/lib/appointments";
import { disconnectWhatsapp, renameWhatsappInstance } from "@/lib/whatsapp-connection";
import { disconnectGoogleCalendar } from "@/lib/google-calendar";
import { disconnectInstagram } from "@/lib/instagram";

const CONNECTION_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

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

// Config da IA/agente — separada de updateClinicSettings (abaixo) pra viver
// na própria página "Agente de IA" sem arriscar sobrescrever os campos que
// ficaram em "Automações" quando os dois formulários salvam em momentos
// diferentes.
export async function updateAiAgentSettings(clinicId: string, formData: FormData) {
  await requireInternalSession();

  const aiSystemPrompt = String(formData.get("aiSystemPrompt") ?? "").trim() || null;
  const welcomeVideoUrl = String(formData.get("welcomeVideoUrl") ?? "").trim() || null;
  const notifyWhatsappNumber = String(formData.get("notifyWhatsappNumber") ?? "").trim() || null;

  await prisma.clinic.update({
    where: { id: clinicId },
    data: { aiSystemPrompt, welcomeVideoUrl, notifyWhatsappNumber },
  });

  revalidatePath(`/crm/clinicas/${clinicId}/agente-ia`);
}

// Formulário próprio (não junto de updateAiAgentSettings) pelo mesmo
// motivo do comentário acima — timing é conceitualmente separado de
// prompt/vídeo/WhatsApp, e por clínica (diferente das outras duas faixas
// de computeAdaptiveDelaySeconds, que são globais e ficam em Configurações).
export async function updateAiAgentTiming(clinicId: string, formData: FormData) {
  await requireInternalSession();

  const firstBandDelaySeconds = parseInt(String(formData.get("firstBandDelaySeconds") ?? ""), 10);
  if (!Number.isFinite(firstBandDelaySeconds) || firstBandDelaySeconds < 30 || firstBandDelaySeconds > 60) {
    throw new Error("O delay da faixa de até 1h precisa ser entre 30 e 60 segundos.");
  }

  await prisma.clinic.update({
    where: { id: clinicId },
    data: { firstBandDelaySeconds },
  });

  revalidatePath(`/crm/clinicas/${clinicId}/agente-ia`);
}

// firstReminderHours/secondReminderHours em vez de um único campo de texto
// livre ("horas antes, separadas por vírgula") — digitação solta era
// sujeita a erro de formatação (espaço a mais, vírgula esquecida). Dois
// campos numéricos porque hoje o produto sempre usa exatamente 2
// lembretes; reminders.ts em si itera a lista genericamente, então
// suportaria mais no futuro se precisar.
export async function updateClinicSettings(clinicId: string, formData: FormData) {
  await requireInternalSession();

  const clientWhatsappNumber = String(formData.get("clientWhatsappNumber") ?? "").trim() || null;
  const active = formData.get("active") === "on";

  const firstReminderHours = parseInt(String(formData.get("firstReminderHours") ?? ""), 10);
  const secondReminderHours = parseInt(String(formData.get("secondReminderHours") ?? ""), 10);
  if (!Number.isFinite(firstReminderHours) || firstReminderHours <= 0) {
    throw new Error("Informe um número de horas válido (maior que zero) para o 1º lembrete.");
  }
  if (!Number.isFinite(secondReminderHours) || secondReminderHours <= 0) {
    throw new Error("Informe um número de horas válido (maior que zero) para o 2º lembrete.");
  }
  const hoursBefore = [firstReminderHours, secondReminderHours];

  await prisma.clinic.update({
    where: { id: clinicId },
    data: {
      clientWhatsappNumber,
      active,
      reminderConfig: {
        upsert: {
          create: { hoursBefore },
          update: { hoursBefore },
        },
      },
    },
  });

  revalidatePath(`/crm/clinicas/${clinicId}/automacoes`);
  revalidatePath(`/crm/clinicas/${clinicId}`);
}

export type ConnectionLinkChannel = "google-calendar" | "instagram";

// Link público de auto-conexão (ver src/app/conectar/[token]/page.tsx) —
// token de 24 bytes aleatórios (base64url), nunca o id real da clínica.
// Um por canal (WhatsApp fica de fora, já tem QR code próprio) — se já
// existir um link pendente pro mesmo canal/clínica, reaproveita em vez de
// gerar outro (evita links duplicados de cliques repetidos). Expira em 7
// dias ou no primeiro uso bem-sucedido (usedAt), o que vier primeiro.
//
// Sem redirect: chamada direto de um client component (ver
// ConnectionLinkButton) que copia a URL retornada pra área de
// transferência na hora, sem navegar/recarregar a página.
export async function createConnectionLink(
  clinicId: string,
  channel: ConnectionLinkChannel
): Promise<{ token: string; url: string }> {
  await requireInternalSession();

  const existing = await prisma.connectionLink.findFirst({
    where: { clinicId, channel, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    return { token: existing.token, url: `${process.env.APP_URL ?? ""}/conectar/${existing.token}` };
  }

  const token = crypto.randomBytes(24).toString("base64url");

  await prisma.connectionLink.create({
    data: { clinicId, channel, token, expiresAt: new Date(Date.now() + CONNECTION_LINK_TTL_MS) },
  });

  revalidatePath(`/crm/clinicas/${clinicId}/conexoes`);
  return { token, url: `${process.env.APP_URL ?? ""}/conectar/${token}` };
}

// Cancela um link recém-gerado antes de mandar pro cliente (ex: gerou por
// engano) — mesma marca de "usado" que o callback OAuth usa depois de uma
// conexão real, então o link para de funcionar imediatamente.
export async function cancelConnectionLink(clinicId: string, token: string): Promise<void> {
  await requireInternalSession();

  await prisma.connectionLink.updateMany({
    where: { token, clinicId },
    data: { usedAt: new Date() },
  });

  revalidatePath(`/crm/clinicas/${clinicId}/conexoes`);
}

export type CreateClientLoginState = { error: string | null };

// Usa useActionState no form (ver CreateClientLoginForm) em vez de deixar
// o form disparar isso como action "crua" — email duplicado (User.email é
// @unique) é um erro esperado, não excepcional (autofill do navegador
// reenviando um e-mail já cadastrado antes é o caso mais comum), então
// precisa aparecer como mensagem no formulário, não derrubar a página
// inteira com a tela genérica de erro do Next.
export async function createClientLogin(
  clinicId: string,
  _prevState: CreateClientLoginState,
  formData: FormData
): Promise<CreateClientLoginState> {
  await requireInternalSession();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !name || password.length < 8) {
    return { error: "Preencha nome, e-mail e senha (mín. 8 caracteres)." };
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    await prisma.user.create({
      data: { email, name, passwordHash, role: "CLIENT", clinicId },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: "Já existe um acesso cadastrado com esse e-mail." };
    }
    throw err;
  }

  revalidatePath("/crm/painel");
  revalidatePath(`/crm/clinicas/${clinicId}`);
  return { error: null };
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
    if (appt.conversationId) revalidatePath(`/crm/conversas/${appt.conversationId}`);
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

// Desconecta o Google Calendar da clínica — revoga o acesso OAuth e volta
// o card de Conexões pra "Não conectado". Caso de uso real: clínica em
// teste (Plano Piloto 21D) desiste antes de terminar; não dá pra depender
// de esperar o token expirar sozinho.
export async function disconnectGoogleCalendarAction(clinicId: string) {
  await requireInternalSession();
  await disconnectGoogleCalendar(clinicId);
  revalidatePath(`/crm/clinicas/${clinicId}/conexoes`);
  revalidatePath(`/crm/clinicas/${clinicId}`);
  revalidatePath("/crm/painel");
}

// Mesmo espírito do disconnect do Google Calendar acima — clínica em teste
// desiste, preciso poder soltar o Instagram na hora sem esperar prazo
// nenhum.
export async function disconnectInstagramAction(clinicId: string) {
  await requireInternalSession();
  await disconnectInstagram(clinicId);
  revalidatePath(`/crm/clinicas/${clinicId}/conexoes`);
  revalidatePath(`/crm/clinicas/${clinicId}`);
  revalidatePath("/crm/painel");
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
