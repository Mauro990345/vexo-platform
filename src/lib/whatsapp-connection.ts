import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  createWhatsappInstance,
  deleteWhatsappInstance,
  fetchWhatsappConnectionState,
  fetchWhatsappQr,
  logoutWhatsappInstance,
  whatsappInstanceExists,
  EvolutionInstanceNotFoundError,
  EvolutionInstanceNameInUseError,
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

// Nome novo pra quando o atual está "queimado" (instância fantasma — ver
// EvolutionInstanceNameInUseError/ensureWhatsappQrForClinic abaixo e
// resetWhatsappPairing mais abaixo, pedido explícito item "a"/"b"): sempre
// a partir do SLUG da clínica (nunca do nome anterior, que já pode ter um
// sufixo de uma recuperação passada — evitar empilhar sufixos em
// incidentes repetidos). Sufixo hex curto via randomBytes (mesma convenção
// de oauth-state.ts, não Math.random) — já bate com a validação existente
// de nome de instância (/^[a-z0-9-]+$/, ver renameWhatsappInstance abaixo),
// sem precisar normalizar.
export function generateFreshWhatsappInstanceName(slug: string): string {
  return `${slug}-${randomBytes(3).toString("hex")}`;
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

// Bug real investigado (1ª parte): esta função rodava createWhatsappInstance
// em TODO carregamento da tela, mesmo pra uma instância já existente há
// meses — arriscado na Evolution 2.3.7. Só cria quando whatsappInstanceExists
// confirma que a instância NÃO existe (ver comentário grande lá,
// whatsapp-instance.ts) — mas isso sozinho não bastava: um palpite "talvez
// exista" (timeout na listagem, erro de rede) levava direto pro
// /instance/connect, e se a instância fosse uma "fantasma" (existe no
// banco da Evolution e no Manager, mas não carregada em memória —
// connect/connectionState/delete devolvem 404/400 "does not exist"), o QR
// simplesmente falhava sem nenhuma recuperação — era preciso abrir o
// Manager e recriar a instância na mão (bug real investigado, 2ª parte).
//
// Pedido explícito (item "a"): recuperação automática, no máximo UMA
// tentativa por chamada (sem loop):
//   1. tenta /instance/connect com o nome atual direto;
//   2. se vier "não existe" (EvolutionInstanceNotFoundError), cria com o
//      MESMO nome (sem tolerar conflito — qualquer erro aqui é
//      informação nova) e tenta o connect de novo;
//   3. se ESSE create disser "nome já em uso" (EvolutionInstanceNameInUseError
//      — a própria instância fantasma barrando o nome), desiste do nome
//      atual: gera um nome novo (slug + sufixo curto), salva em
//      Clinic.whatsappInstanceName, cria e conecta — essa é a ÚLTIMA
//      tentativa, nenhum fallback depois dela.
// Qualquer erro fora desses dois tipos conhecidos sobe direto (sem
// recuperação) — só reagimos aos dois jeitos conhecidos de "instância
// quebrada", nunca tentamos adivinhar outros casos.
export async function ensureWhatsappQrForClinic(
  clinicId: string
): Promise<{ instanceName: string; qrBase64: string | null; recovered: boolean }> {
  const instanceName = await ensureInstanceName(clinicId);

  // Só pula o create quando a Evolution CONFIRMOU (lista válida, sem
  // timeout/erro) que o nome já existe — ambíguo cai no mesmo caminho de
  // "talvez exista", que tenta o connect direto, abaixo, e reage ao erro
  // de verdade (pedido explícito, item "c" — ver whatsappInstanceExists,
  // whatsapp-instance.ts).
  const existsGuess = await whatsappInstanceExists(instanceName);
  if (!existsGuess) {
    await createWhatsappInstance(instanceName);
  }

  try {
    const qr = await fetchWhatsappQr(instanceName);
    return { instanceName, qrBase64: qr.qrBase64, recovered: false };
  } catch (err) {
    if (!(err instanceof EvolutionInstanceNotFoundError)) throw err;
  }

  // connect disse "não existe" — tenta recriar com o MESMO nome, uma vez.
  try {
    await createWhatsappInstance(instanceName, { tolerateConflict: false });
    const qr = await fetchWhatsappQr(instanceName);
    return { instanceName, qrBase64: qr.qrBase64, recovered: true };
  } catch (err) {
    if (!(err instanceof EvolutionInstanceNameInUseError)) throw err;
  }

  // "nome já em uso" — era a própria fantasma barrando o nome. Última
  // tentativa: nome novo, salvo na clínica, criado e conectado.
  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { id: clinicId } });
  const freshName = generateFreshWhatsappInstanceName(clinic.slug);
  await prisma.clinic.update({ where: { id: clinicId }, data: { whatsappInstanceName: freshName } });
  await createWhatsappInstance(freshName, { tolerateConflict: false });
  const qr = await fetchWhatsappQr(freshName);
  return { instanceName: freshName, qrBase64: qr.qrBase64, recovered: true };
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
// aparece. Pedido explícito (1ª rodada): hoje só aparecia em "open" (pra
// desconectar um número já pareado); passou a aparecer também em
// "connecting". Pedido explícito (2ª rodada, item "b"): continua
// aparecendo em "open" (pra "Desconectar", de sempre) E passa a aparecer
// em QUALQUER outro estado — inclusive "desconhecido" e "desconectado" —
// porque é exatamente nesses estados (instância fantasma:
// connect/connectionState devolvem 404/400 "does not exist", status vira
// "desconhecido") que a pessoa mais precisa de um jeito de forçar a
// recuperação, e o botão sumia bem ali (bug real investigado). Na prática
// sempre `true` agora — mantida como função nomeada (não um literal
// `true` espalhado pela UI) pra documentar a intenção e continuar fácil
// de testar/ajustar se um estado precisar ficar sem o botão no futuro.
export function shouldShowWhatsappResetAction(_status: WhatsappConnectionState): boolean {
  return true;
}

// MESMO botão, posição e estilo em todos os casos — só o RÓTULO e a AÇÃO
// POR TRÁS mudam (ver WhatsappConnectionPanel.tsx, que escolhe entre
// disconnectAction e resetPairingAction conforme o status):
// "Desconectar" (status "open", já pareado — só solta o número,
// disconnectWhatsapp/logoutWhatsappInstance, igual sempre foi) vs.
// "Reiniciar pareamento" (qualquer outro status — resetWhatsappPairing,
// abaixo, que APAGA e deixa a próxima carga da tela recriar do zero,
// inclusive se recuperando de uma instância fantasma). Bug real
// investigado: logout sozinho não limpa uma sessão/credenciais corrompidas
// do lado da Evolution — era exatamente isso que fazia "Reiniciar
// pareamento" não resolver nada antes desta mudança.
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
// nunca CRIA/CONECTA aqui: a próxima carga da tela de conexão já faz isso
// sozinha (ensureWhatsappQrForClinic, que checa whatsappInstanceExists
// antes de criar, ver acima), reaproveitando o MESMO caminho que já
// existe pra "instância nova", sem duplicar a lógica de criação. Pedido
// explícito: nunca acontece sozinho, só no clique do botão "Reiniciar
// pareamento".
//
// Pedido explícito (item "b"): se o delete disser "não existe" (instância
// fantasma — ver EvolutionInstanceNotFoundError/deleteWhatsappInstance,
// whatsapp-instance.ts), não insiste no MESMO nome na próxima carga da
// tela (é provavelmente essa mesma fantasma barrando ele de novo) — já
// gera um nome novo aqui, direto, a partir do slug da clínica. A criação
// em si continua ficando pra próxima carga da tela (ensureWhatsappQrForClinic),
// que vai achar um nome novo nunca usado — sem precisar de nenhuma
// recuperação adicional, o create de primeira já funciona.
export async function resetWhatsappPairing(clinicId: string): Promise<void> {
  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { id: clinicId } });
  if (!clinic.whatsappInstanceName) return;

  const { notFound } = await deleteWhatsappInstance(clinic.whatsappInstanceName);

  if (notFound) {
    const freshName = generateFreshWhatsappInstanceName(clinic.slug);
    await prisma.clinic.update({
      where: { id: clinicId },
      data: { whatsappInstanceName: freshName, whatsappStatus: null, whatsappStatusCheckedAt: null },
    });
    return;
  }

  await prisma.clinic.update({
    where: { id: clinicId },
    data: { whatsappStatus: null, whatsappStatusCheckedAt: null },
  });
}

// Pedido explícito (item "d"): mensagem clara em português do que está
// acontecendo e o que fazer, nunca o JSON bruto que a Evolution devolve
// (err.message, nas duas exceções conhecidas abaixo, inclui o nome da
// instância mas NUNCA o corpo bruto da resposta — ver
// EvolutionInstanceNotFoundError/EvolutionInstanceNameInUseError,
// whatsapp-instance.ts; qualquer outro erro, incluindo um que por engano
// carregasse algo bruto, cai no fallback genérico abaixo, que nunca usa
// err.message). Usada pela tela de conexão (page.tsx) pra converter
// qualquer erro pego nos passos de status/QR num texto pronto pro card —
// ela também recebe `recovered` (true quando ensureWhatsappQrForClinic
// conseguiu só depois de recriar a instância sozinho) pra avisar que uma
// recuperação automática aconteceu, não só mostrar erro.
export function describeWhatsappConnectionError(err: unknown): string {
  if (err instanceof EvolutionInstanceNotFoundError) {
    return "A instância do WhatsApp não foi encontrada na Evolution, mesmo depois de tentar recriá-la automaticamente. Clique em “Reiniciar pareamento” para tentar de novo.";
  }
  if (err instanceof EvolutionInstanceNameInUseError) {
    return "Não foi possível reservar um nome livre para a instância agora. Clique em “Reiniciar pareamento” para tentar de novo.";
  }
  return "Não foi possível falar com a Evolution API agora. Tente novamente em alguns instantes; se persistir, clique em “Reiniciar pareamento”.";
}

export const WHATSAPP_RECOVERED_MESSAGE =
  "A instância anterior estava com problema e foi recriada automaticamente — escaneie o novo código abaixo.";

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
