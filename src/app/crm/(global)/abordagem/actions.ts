"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireInternalSession } from "@/lib/session";
import { buildInstagramDmLink } from "@/lib/reactivation";
import { parseApproachTimeToMinutes, validateApproachWindow } from "@/lib/approach-queue";
import {
  extractApproachRowsFromCsvText,
  parseApproachUsernamesTxt,
  uploadApproachLeads,
  setApproachDailyLimit,
  setApproachActiveInQueue,
  setApproachPaused,
  saveApproachMessages,
  copyApproachMessagesFrom,
  getApproachMessagesConfig,
  getApproachBoard,
  getApproachBoardAccount,
  getApproachWindow,
  setApproachWindow,
  sendNextApproachItem,
  undoLastApproachSend,
  skipApproachItem,
  type ApproachBoardAccount,
  type ApproachWindow,
} from "@/lib/approach-queue-db";

// Admin só, por enquanto (ver comentário grande em UserRole.APPROACH_AGENT,
// schema.prisma) — requireInternalSession cobre INTERNAL_ADMIN/
// INTERNAL_STAFF, nenhum dos dois é o papel novo restrito por clínica.
async function requireApproachAdmin() {
  return requireInternalSession();
}

const PREP_PATH = "/crm/abordagem";
const QUEUE_PATH = "/crm/abordagem/fila";

export async function listClinicsForPrep() {
  await requireApproachAdmin();
  const clinics = await prisma.clinic.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      instagramAccount: { select: { igUsername: true } },
      approachQueueConfig: { select: { dailyLimit: true, activeInQueue: true, paused: true } },
      approachMessagesConfig: { select: { message1: true } },
    },
  });
  return clinics.map((c) => ({
    id: c.id,
    name: c.name,
    igUsername: c.instagramAccount?.igUsername ?? null,
    dailyLimit: c.approachQueueConfig?.dailyLimit ?? 60,
    activeInQueue: c.approachQueueConfig?.activeInQueue ?? false,
    paused: c.approachQueueConfig?.paused ?? false,
    hasMessages: Boolean(c.approachMessagesConfig?.message1),
  }));
}

export async function toggleActiveInQueueAction(clinicId: string, active: boolean) {
  await requireApproachAdmin();
  await setApproachActiveInQueue(clinicId, active);
  revalidatePath(PREP_PATH);
}

export async function updateDailyLimitAction(clinicId: string, formData: FormData) {
  await requireApproachAdmin();
  const dailyLimit = parseInt(String(formData.get("dailyLimit") ?? ""), 10);
  await setApproachDailyLimit(clinicId, dailyLimit);
  revalidatePath(PREP_PATH);
}

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB — bem acima de qualquer lista real (milhares de @s)

// Aceita .csv e .txt (um @ por linha) — .xlsx não é suportado (a única
// biblioteca JS madura pra isso tem vulnerabilidades conhecidas sem
// correção publicada; exportar a planilha como CSV antes de enviar resolve
// em 1 clique, no Excel/Sheets).
export async function uploadApproachLeadsAction(formData: FormData) {
  await requireApproachAdmin();
  const clinicId = String(formData.get("clinicId") ?? "");
  if (!clinicId) throw new Error("Selecione a clínica.");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Selecione um arquivo.");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("Arquivo muito grande — envie uma lista menor.");

  const text = await file.text();
  const isTxt = file.name.toLowerCase().endsWith(".txt");
  const rows = isTxt ? parseApproachUsernamesTxt(text) : extractApproachRowsFromCsvText(text);

  const result = await uploadApproachLeads(clinicId, rows);
  revalidatePath(PREP_PATH);
  revalidatePath(QUEUE_PATH);
  return result;
}

export async function getApproachMessagesAction(clinicId: string) {
  await requireApproachAdmin();
  return getApproachMessagesConfig(clinicId);
}

export async function saveApproachMessagesAction(clinicId: string, formData: FormData) {
  await requireApproachAdmin();
  const read = (key: string) => {
    const value = String(formData.get(key) ?? "").trim();
    return value || null;
  };
  await saveApproachMessages(clinicId, {
    message1: read("message1"),
    message2: read("message2"),
    message3: read("message3"),
    message4: read("message4"),
    message5: read("message5"),
  });
  revalidatePath(`/crm/abordagem/${clinicId}/mensagens`);
  revalidatePath(PREP_PATH);
}

export async function copyApproachMessagesFromAction(targetClinicId: string, sourceClinicId: string) {
  await requireApproachAdmin();
  if (!sourceClinicId) throw new Error("Selecione a clínica de origem.");
  await copyApproachMessagesFrom(targetClinicId, sourceClinicId);
  revalidatePath(`/crm/abordagem/${targetClinicId}/mensagens`);
}

export async function getClinicsForMessagesCopyAction(excludeClinicId: string) {
  await requireApproachAdmin();
  const clinics = await prisma.clinic.findMany({
    where: { id: { not: excludeClinicId }, approachMessagesConfig: { is: { message1: { not: null } } } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return clinics;
}

export async function getClinicNameAction(clinicId: string) {
  await requireApproachAdmin();
  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { name: true } });
  return clinic?.name ?? null;
}

// Horário permitido — GLOBAL, vale pra todas as clínicas (ver
// ApproachWindowSettings/getApproachWindow, approach-queue-db.ts).
export async function getApproachWindowAction(): Promise<ApproachWindow> {
  await requireApproachAdmin();
  return getApproachWindow();
}

export async function updateApproachWindowAction(formData: FormData) {
  await requireApproachAdmin();
  const startMinute = parseApproachTimeToMinutes(String(formData.get("windowStart") ?? ""), "Horário inicial");
  const endMinute = parseApproachTimeToMinutes(String(formData.get("windowEnd") ?? ""), "Horário final");
  validateApproachWindow(startMinute, endMinute);
  await setApproachWindow(startMinute, endMinute);
  revalidatePath(PREP_PATH);
  revalidatePath(QUEUE_PATH);
}

// ---------------------------------------------------------------------------
// Fila
// ---------------------------------------------------------------------------

export type ApproachBoard = { accounts: ApproachBoardAccount[]; window: ApproachWindow };

export async function getApproachBoardAction(): Promise<ApproachBoard> {
  await requireApproachAdmin();
  return getApproachBoard(new Date());
}

export type SendApproachMessageActionResult =
  | { ok: true; message: string; dmLink: string; account: ApproachBoardAccount }
  | { ok: false; reason: string };

// Um toque: marca enviado no banco (sendNextApproachItem — já cuida do
// claim atômico anti duplo-toque), monta o link ig.me/m/<@> (mesma função
// de Reativação) e devolve o snapshot ATUALIZADO da conta, pro cliente
// trocar o card na hora sem precisar recarregar o board inteiro. A cópia
// pra área de transferência e o window.open acontecem no cliente (aqui não
// tem acesso a nenhum dos dois).
export async function sendApproachMessageAction(clinicId: string): Promise<SendApproachMessageActionResult> {
  await requireApproachAdmin();
  const result = await sendNextApproachItem(clinicId, new Date());
  if (!result.ok) return { ok: false, reason: result.reason };

  const account = await getApproachBoardAccount(clinicId, new Date());
  revalidatePath(QUEUE_PATH);
  return { ok: true, message: result.message, dmLink: buildInstagramDmLink(result.igUsername, result.message), account: account! };
}

export async function undoApproachSendAction(clinicId: string): Promise<ApproachBoardAccount | null> {
  await requireApproachAdmin();
  await undoLastApproachSend(clinicId);
  revalidatePath(QUEUE_PATH);
  return getApproachBoardAccount(clinicId, new Date());
}

export async function skipApproachItemAction(clinicId: string, itemId: string): Promise<ApproachBoardAccount | null> {
  await requireApproachAdmin();
  await skipApproachItem(itemId);
  revalidatePath(QUEUE_PATH);
  return getApproachBoardAccount(clinicId, new Date());
}

export async function setApproachPausedAction(clinicId: string, paused: boolean): Promise<ApproachBoardAccount | null> {
  await requireApproachAdmin();
  await setApproachPaused(clinicId, paused);
  revalidatePath(QUEUE_PATH);
  return getApproachBoardAccount(clinicId, new Date());
}
