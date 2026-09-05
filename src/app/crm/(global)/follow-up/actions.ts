"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireInternalSession } from "@/lib/session";
import { saveUploadedAttachment, deleteUploadedAttachment } from "@/lib/uploads";
import type { FollowUpTrigger } from "@prisma/client";

// Duas sequências independentes (SILENCE / NO_SHOW), cada uma com sua
// própria lista de passos. Alimenta diretamente o job existente em
// src/lib/follow-up.ts (dispatchFollowUpSteps) — não é uma automação nova.
// `order` é só chave de ordenação dentro do trigger; a posição da lista
// ordenada é o que importa pra lógica do job.
//
// revalidatePath usa "layout" (não o path exato) porque essa mesma config
// é renderizada em duas rotas diferentes — /crm/follow-up (global) e
// /crm/clinicas/[id]/follow-up (dentro do contexto de uma clínica) — e as
// duas precisam refletir a mudança, não só a que originou a ação.

function readOffsetDays(formData: FormData): number {
  const offsetDays = parseInt(String(formData.get("offsetDays") ?? ""), 10);
  if (!Number.isFinite(offsetDays) || offsetDays < 0) {
    throw new Error("Informe um número de dias válido (0 ou mais).");
  }
  return offsetDays;
}

// Anexo agora é upload de arquivo (imagem/vídeo), não mais uma URL colada
// — o campo do form se chama "attachmentFile" (File) em vez de
// "attachmentUrl" (texto), mas o que fica salvo no banco continua sendo
// uma URL (a nossa própria, servida de public/uploads — ver src/lib/uploads.ts).
async function readAttachmentFile(formData: FormData): Promise<File | null> {
  const file = formData.get("attachmentFile");
  return file instanceof File && file.size > 0 ? file : null;
}

// Liga/desliga o delay artificial de resposta da IA (ver
// computeAdaptiveDelaySeconds em src/lib/scheduler.ts). Desligado é usado
// pra testar o sistema sem esperar as faixas de 30s-10min — a IA passa a
// responder quase na hora (FAST_REPLY_DELAY_SECONDS). Global mesmo
// (AiSettings não tem clinicId) — a faixa "até 1h" É por clínica, mora em
// Clinic.firstBandDelaySeconds (ver updateAiAgentTiming em
// crm/clinicas/actions.ts), não aqui.
//
// Essa mesma action alimenta o form tanto em Configurações quanto na
// tela "Agente de IA" de cada clínica — o toggle aparece repetido nos
// dois lugares de propósito (é global de qualquer forma).
export async function updateAiSettings(formData: FormData) {
  await requireInternalSession();

  const adaptiveDelayEnabled = formData.get("adaptiveDelayEnabled") === "on";

  await prisma.aiSettings.upsert({
    where: { id: "singleton" },
    update: { adaptiveDelayEnabled },
    create: { id: "singleton", adaptiveDelayEnabled },
  });

  revalidatePath("/crm", "layout");
}

export async function addFollowUpStep(trigger: FollowUpTrigger, formData: FormData) {
  await requireInternalSession();

  const content = String(formData.get("content") ?? "").trim();
  if (!content) throw new Error("O texto da mensagem é obrigatório.");
  const offsetDays = readOffsetDays(formData);

  const file = await readAttachmentFile(formData);
  const attachmentUrl = file ? await saveUploadedAttachment(file, "follow-up") : null;

  const last = await prisma.followUpStep.findFirst({ where: { trigger }, orderBy: { order: "desc" } });
  await prisma.followUpStep.create({
    data: { trigger, order: (last?.order ?? -1) + 1, content, attachmentUrl, offsetDays },
  });

  revalidatePath("/crm", "layout");
}

export async function updateFollowUpStep(stepId: string, formData: FormData) {
  await requireInternalSession();

  const content = String(formData.get("content") ?? "").trim();
  if (!content) throw new Error("O texto da mensagem é obrigatório.");
  const offsetDays = readOffsetDays(formData);

  const currentAttachmentUrl = String(formData.get("currentAttachmentUrl") ?? "").trim() || null;
  const removeAttachment = formData.get("removeAttachment") === "on";
  const file = await readAttachmentFile(formData);

  let attachmentUrl = currentAttachmentUrl;
  if (file) {
    attachmentUrl = await saveUploadedAttachment(file, "follow-up");
    await deleteUploadedAttachment(currentAttachmentUrl);
  } else if (removeAttachment) {
    await deleteUploadedAttachment(currentAttachmentUrl);
    attachmentUrl = null;
  }

  await prisma.followUpStep.update({ where: { id: stepId }, data: { content, attachmentUrl, offsetDays } });
  revalidatePath("/crm", "layout");
}

export async function deleteFollowUpStep(stepId: string) {
  await requireInternalSession();
  const step = await prisma.followUpStep.delete({ where: { id: stepId } });
  await deleteUploadedAttachment(step.attachmentUrl);
  revalidatePath("/crm", "layout");
}

export async function moveFollowUpStep(stepId: string, direction: "up" | "down") {
  await requireInternalSession();

  const step = await prisma.followUpStep.findUnique({ where: { id: stepId } });
  if (!step) return;

  const steps = await prisma.followUpStep.findMany({
    where: { trigger: step.trigger },
    orderBy: { order: "asc" },
  });
  const index = steps.findIndex((s) => s.id === stepId);
  if (index === -1) return;

  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= steps.length) return;

  const a = steps[index]!;
  const b = steps[swapIndex]!;

  // `order` é único por trigger, então a troca precisa de um valor
  // temporário — os dois updates diretos colidiriam, já que o Postgres
  // checa a constraint a cada statement, não só no fim da transação.
  await prisma.$transaction([
    prisma.followUpStep.update({ where: { id: a.id }, data: { order: -1 } }),
    prisma.followUpStep.update({ where: { id: b.id }, data: { order: a.order } }),
    prisma.followUpStep.update({ where: { id: a.id }, data: { order: b.order } }),
  ]);

  revalidatePath("/crm", "layout");
}

export async function updateFollowUpSettings(formData: FormData) {
  await requireInternalSession();

  const silenceHours = parseInt(String(formData.get("silenceHours") ?? ""), 10);
  if (!Number.isFinite(silenceHours) || silenceHours < 1) {
    throw new Error("Informe um número de horas válido (1 ou mais).");
  }

  await prisma.followUpSettings.upsert({
    where: { id: "singleton" },
    update: { silenceHours },
    create: { id: "singleton", silenceHours },
  });

  revalidatePath("/crm", "layout");
}

function parseTimeToMinutes(value: string, label: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) throw new Error(`${label} inválido — use o formato HH:MM.`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new Error(`${label} inválido.`);
  return hours * 60 + minutes;
}

// Janela de envio — vale pras duas sequências (SILENCE e NO_SHOW). Fora
// dela, o horário de envio é adiado pra próxima ocorrência válida em vez de
// disparar na hora (ver nextValidSendTime em src/lib/follow-up-window.ts).
export async function updateFollowUpWindow(formData: FormData) {
  await requireInternalSession();

  const windowDays = formData
    .getAll("windowDays")
    .map((v) => parseInt(String(v), 10))
    .filter((v) => Number.isFinite(v));
  if (windowDays.length === 0) {
    throw new Error("Selecione pelo menos um dia da semana.");
  }

  const windowStartMinute = parseTimeToMinutes(String(formData.get("windowStart") ?? ""), "Horário inicial");
  const windowEndMinute = parseTimeToMinutes(String(formData.get("windowEnd") ?? ""), "Horário final");
  if (windowStartMinute >= windowEndMinute) {
    throw new Error("O horário inicial precisa ser antes do horário final.");
  }

  await prisma.followUpSettings.upsert({
    where: { id: "singleton" },
    update: { windowDays, windowStartMinute, windowEndMinute },
    create: { id: "singleton", windowDays, windowStartMinute, windowEndMinute },
  });

  revalidatePath("/crm", "layout");
}
