import { prisma } from "@/lib/prisma";
import {
  createWhatsappInstance,
  deleteWhatsappInstance,
  fetchWhatsappConnectionState,
  fetchWhatsappQr,
  logoutWhatsappInstance,
  whatsappInstanceExists,
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

// Bug real investigado: esta função rodava createWhatsappInstance em TODO
// carregamento da tela, mesmo pra uma instância já existente há meses —
// arriscado na Evolution 2.3.7 (ver comentário grande em
// createWhatsappInstance/whatsappInstanceExists, whatsapp-instance.ts).
// Agora só cria quando whatsappInstanceExists confirma que a instância
// NÃO existe — qualquer QR pedido daqui em diante é sempre pra uma
// instância que o VEXO confirmou (ou já sabia) que existe, nunca uma
// recriação às cegas.
export async function ensureWhatsappQrForClinic(
  clinicId: string
): Promise<{ instanceName: string; qrBase64: string | null }> {
  const instanceName = await ensureInstanceName(clinicId);

  const exists = await whatsappInstanceExists(instanceName);
  if (!exists) {
    await createWhatsappInstance(instanceName);
  }
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

// Volta o nome da instância pro slug da clínica (o padrão de sempre) sem
// precisar que quem está mexendo saiba ou lembre qual é esse valor — útil
// depois de ter renomeado pra reaproveitar outra instância e querer
// desfazer isso.
export async function resetWhatsappInstanceName(clinicId: string): Promise<void> {
  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { id: clinicId } });
  await prisma.clinic.update({
    where: { id: clinicId },
    data: { whatsappInstanceName: clinic.slug, whatsappStatus: null, whatsappStatusCheckedAt: null },
  });
}

// Pura — decide se o botão de reset (ver WhatsappConnectionPanel.tsx)
// aparece. Pedido explícito: hoje só aparecia em "open" (pra desconectar
// um número já pareado); passa a aparecer também em "connecting", onde é
// o ÚNICO jeito de sair de uma sessão travada.
export function shouldShowWhatsappResetAction(status: WhatsappConnectionState): boolean {
  return status === "open" || status === "connecting";
}

// MESMO botão, posição e estilo nos dois casos — só o RÓTULO e a AÇÃO POR
// TRÁS mudam (ver WhatsappConnectionPanel.tsx, que escolhe entre
// disconnectAction e resetPairingAction conforme o status):
// "Desconectar" (status "open", já pareado — só solta o número,
// disconnectWhatsapp/logoutWhatsappInstance, igual sempre foi) vs.
// "Reiniciar pareamento" (status "connecting", sessão travada —
// resetWhatsappPairing, abaixo, que APAGA e deixa a próxima carga da tela
// recriar do zero). Bug real investigado: logout sozinho não limpa uma
// sessão/credenciais corrompidas do lado da Evolution — era exatamente
// isso que fazia "Reiniciar pareamento" não resolver nada antes desta
// mudança.
export function whatsappResetActionLabel(status: WhatsappConnectionState): string {
  return status === "open" ? "Desconectar" : "Reiniciar pareamento";
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

// Apaga a instância de verdade (deleteWhatsappInstance — ver comentário
// grande lá pro porquê de delete, não só logout) e limpa o status salvo —
// nunca recria aqui: a próxima carga da tela de conexão já faz isso
// sozinha (ensureWhatsappQrForClinic, que checa whatsappInstanceExists
// antes de criar, ver acima), reaproveitando o MESMO caminho que já
// existe pra "instância nova", sem duplicar a lógica de criação. Pedido
// explícito: nunca acontece sozinho, só no clique do botão "Reiniciar
// pareamento".
export async function resetWhatsappPairing(clinicId: string): Promise<void> {
  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { id: clinicId } });
  if (!clinic.whatsappInstanceName) return;

  await deleteWhatsappInstance(clinic.whatsappInstanceName);

  await prisma.clinic.update({
    where: { id: clinicId },
    data: { whatsappStatus: null, whatsappStatusCheckedAt: null },
  });
}

// ~45s (pedido explícito, item "d" — mensagem de erro clara em vez de
// ficar eternamente em "Conectando…"). Investigado: a própria Evolution
// NUNCA reporta um estado distinto de "falha de pareamento" pro bug
// atual (companion_reg_refresh — ver pesquisa anexada) — o
// /instance/connectionState simplesmente continua devolvendo "connecting"
// pra sempre, porque o evento de sucesso nunca chega a disparar do lado
// do Baileys; não existe nenhum campo de erro pra ler. Esta função é um
// heurístico client-side (tempo decorrido desde que ESTE QR específico
// apareceu, ver WhatsappConnectionPanel.tsx), não uma leitura de erro da
// Evolution — o único sinal realista disponível hoje. 45s dá folga pra um
// escaneamento normal (QR costuma durar bem menos que isso) sem deixar a
// pessoa esperando "pra sempre" sem feedback nenhum.
export const WHATSAPP_PAIRING_STUCK_THRESHOLD_MS = 45_000;

export function isWhatsappPairingStuck(connectingSinceMs: number, nowMs: number): boolean {
  return nowMs - connectingSinceMs >= WHATSAPP_PAIRING_STUCK_THRESHOLD_MS;
}
