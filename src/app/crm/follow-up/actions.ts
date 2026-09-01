"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireInternalSession } from "@/lib/session";
import { uploadAttachment, deleteAttachment } from "@/lib/storage";

// Sequência de follow-up: global, alimenta diretamente o job existente em
// src/lib/follow-up.ts (dispatchFollowUpSteps). `order` é só chave de
// ordenação — a posição da lista ordenada é o que importa pra lógica do job.

function readOffsetDays(formData: FormData): number {
  const offsetDays = parseInt(String(formData.get("offsetDays") ?? ""), 10);
  if (!Number.isFinite(offsetDays) || offsetDays < 0) {
    throw new Error("Informe um número de dias válido (0 ou mais).");
  }
  return offsetDays;
}

export async function addFollowUpStep(formData: FormData) {
  await requireInternalSession();

  const content = String(formData.get("content") ?? "").trim();
  if (!content) throw new Error("O texto da mensagem é obrigatório.");
  const offsetDays = readOffsetDays(formData);

  const file = formData.get("attachmentFile");
  const attachmentUrl = file instanceof File && file.size > 0 ? await uploadAttachment(file, "follow-up") : null;

  const last = await prisma.followUpStep.findFirst({ orderBy: { order: "desc" } });
  await prisma.followUpStep.create({
    data: { order: (last?.order ?? -1) + 1, content, attachmentUrl, offsetDays },
  });

  revalidatePath("/crm/follow-up");
}

export async function updateFollowUpStep(stepId: string, formData: FormData) {
  await requireInternalSession();

  const content = String(formData.get("content") ?? "").trim();
  if (!content) throw new Error("O texto da mensagem é obrigatório.");
  const offsetDays = readOffsetDays(formData);

  const existing = await prisma.followUpStep.findUniqueOrThrow({ where: { id: stepId } });
  let attachmentUrl = existing.attachmentUrl;

  const file = formData.get("attachmentFile");
  const removeAttachment = formData.get("removeAttachment") === "on";

  if (file instanceof File && file.size > 0) {
    attachmentUrl = await uploadAttachment(file, "follow-up");
    if (existing.attachmentUrl) await deleteAttachment(existing.attachmentUrl).catch(() => {});
  } else if (removeAttachment && existing.attachmentUrl) {
    await deleteAttachment(existing.attachmentUrl).catch(() => {});
    attachmentUrl = null;
  }

  await prisma.followUpStep.update({ where: { id: stepId }, data: { content, attachmentUrl, offsetDays } });
  revalidatePath("/crm/follow-up");
}

export async function deleteFollowUpStep(stepId: string) {
  await requireInternalSession();
  const deleted = await prisma.followUpStep.delete({ where: { id: stepId } });
  if (deleted.attachmentUrl) await deleteAttachment(deleted.attachmentUrl).catch(() => {});
  revalidatePath("/crm/follow-up");
}

export async function moveFollowUpStep(stepId: string, direction: "up" | "down") {
  await requireInternalSession();

  const steps = await prisma.followUpStep.findMany({ orderBy: { order: "asc" } });
  const index = steps.findIndex((s) => s.id === stepId);
  if (index === -1) return;

  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= steps.length) return;

  const a = steps[index]!;
  const b = steps[swapIndex]!;

  // `order` é @unique, então a troca precisa de um valor temporário — os
  // dois updates diretos colidiriam, já que o Postgres checa a constraint a
  // cada statement, não só no fim da transação.
  await prisma.$transaction([
    prisma.followUpStep.update({ where: { id: a.id }, data: { order: -1 } }),
    prisma.followUpStep.update({ where: { id: b.id }, data: { order: a.order } }),
    prisma.followUpStep.update({ where: { id: a.id }, data: { order: b.order } }),
  ]);

  revalidatePath("/crm/follow-up");
}
