"use server";

import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireClientFilaSession } from "@/lib/session";
import {
  getApproachBoardAccount,
  getApproachWindow,
  confirmApproachSend,
  undoLastApproachSend,
  skipApproachItem,
  setApproachPaused,
  CLINIC_FILA_STACK_SIZE,
  type ApproachBoardAccount,
} from "@/lib/approach-queue-db";
import type { ApproachBoardForClinic, ConfirmApproachSendActionResult } from "@/app/crm/(global)/abordagem/actions";

// Mesmas 5 actions de @/app/crm/(global)/abordagem/actions (admin, ver
// requireApproachAdmin lá), só que gated por CLIENT em vez de
// INTERNAL_ADMIN/STAFF — ClinicFilaView.tsx recebe as duas duplas como
// props injetáveis (default = as internas), então a MESMA tela/mesmas
// regras (tempos de espera, pausa de lote, cards empilhados) valem pras
// duas, sem duplicar nenhuma lógica de negócio: tudo aqui chama direto as
// mesmas funções puras de approach-queue-db.ts que as actions internas
// chamam.
//
// requireClientFilaSession (session.ts) aceita CLIENT com QUALQUER scope
// (inclusive sem scope — quem tem o link do painel completo também pode
// abrir a Fila a partir do botão "Abrir Fila de abordagem", pedido
// explícito) — a única coisa que trava é /dashboard pra quem tem
// scope="fila" (ver requireClientSession/middleware.ts), não o inverso.
//
// clinicId sempre vem de session.user.clinicId (nunca de input do
// cliente/URL — a Fila do cliente não tem :id na rota, é sempre "a
// própria clínica"), mas a conferência abaixo é defesa extra: nunca
// confia só no clinicId que a tela passou de volta pro servidor.
async function requireApproachClient(clinicId: string) {
  const session = await requireClientFilaSession();
  if (session.user.clinicId !== clinicId) notFound();
  return session;
}

const CLIENT_FILA_PATH = "/dashboard/fila";

export async function getApproachBoardForClinicClientAction(clinicId: string): Promise<ApproachBoardForClinic> {
  await requireApproachClient(clinicId);
  const now = new Date();
  const window = await getApproachWindow();
  const account = await getApproachBoardAccount(clinicId, now, window, CLINIC_FILA_STACK_SIZE);
  return { account, window };
}

export async function confirmApproachSendClientAction(clinicId: string, itemId: string): Promise<ConfirmApproachSendActionResult> {
  await requireApproachClient(clinicId);
  const result = await confirmApproachSend(clinicId, itemId, new Date());
  const account = await getApproachBoardAccount(clinicId, new Date());
  revalidatePath(CLIENT_FILA_PATH);
  if (!result.ok) return { ok: false, reason: result.reason };
  return { ok: true, account: account! };
}

export async function undoApproachSendClientAction(clinicId: string): Promise<ApproachBoardAccount | null> {
  await requireApproachClient(clinicId);
  await undoLastApproachSend(clinicId);
  revalidatePath(CLIENT_FILA_PATH);
  return getApproachBoardAccount(clinicId, new Date());
}

export async function skipApproachItemClientAction(clinicId: string, itemId: string): Promise<ApproachBoardAccount | null> {
  await requireApproachClient(clinicId);
  await skipApproachItem(itemId);
  revalidatePath(CLIENT_FILA_PATH);
  return getApproachBoardAccount(clinicId, new Date());
}

export async function setApproachPausedClientAction(clinicId: string, paused: boolean): Promise<ApproachBoardAccount | null> {
  await requireApproachClient(clinicId);
  await setApproachPaused(clinicId, paused);
  revalidatePath(CLIENT_FILA_PATH);
  return getApproachBoardAccount(clinicId, new Date());
}
