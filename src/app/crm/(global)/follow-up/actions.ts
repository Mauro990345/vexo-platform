"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireInternalSession } from "@/lib/session";
import { saveUploadedAttachment, deleteUploadedAttachment } from "@/lib/uploads";
import type { FollowUpTrigger, MessageChannel } from "@prisma/client";

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

// `min` sobe pra 1 no primeiro passo da sequência NO_SHOW — ver
// updateNoShowFirstStepDelay logo abaixo pra entender por quê (a secretária
// precisa dessa janela pra poder desfazer a marcação).
function readOffsetHours(formData: FormData, min = 0): number {
  const offsetHours = parseInt(String(formData.get("offsetHours") ?? ""), 10);
  if (!Number.isFinite(offsetHours) || offsetHours < min) {
    throw new Error(
      min > 0
        ? `Informe um número de horas válido (mínimo ${min}) — a secretária precisa dessa janela pra poder desfazer a marcação de "não compareceu" se for engano, ou se o lead avisar depois que vai atrasar.`
        : "Informe um número de horas válido (0 ou mais)."
    );
  }
  return offsetHours;
}

// Anexo agora é upload de arquivo (imagem/vídeo), não mais uma URL colada
// — o campo do form se chama "attachmentFile" (File) em vez de
// "attachmentUrl" (texto), mas o que fica salvo no banco continua sendo
// uma URL (a nossa própria, servida de public/uploads — ver src/lib/uploads.ts).
async function readAttachmentFile(formData: FormData): Promise<File | null> {
  const file = formData.get("attachmentFile");
  return file instanceof File && file.size > 0 ? file : null;
}

// Canal extra (WHATSAPP) só faz sentido pra sequência NO_SHOW — ver
// comentário em MessageChannel/FollowUpStep.channel no schema. SILENCE
// nunca lê o campo "channel" do form (a UI nem mostra o seletor pra essa
// aba), mas a validação aqui não confia só nisso — reforça no server,
// não só na visibilidade do campo no client.
function readChannel(trigger: FollowUpTrigger, formData: FormData): MessageChannel {
  const raw = String(formData.get("channel") ?? "INSTAGRAM");
  if (raw !== "INSTAGRAM" && raw !== "WHATSAPP") {
    throw new Error(`Canal inválido: ${raw}.`);
  }
  if (raw === "WHATSAPP" && trigger !== "NO_SHOW") {
    throw new Error('O canal WhatsApp só está disponível na sequência "não compareceu".');
  }
  return raw;
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

  const last = await prisma.followUpStep.findFirst({ where: { trigger }, orderBy: { order: "desc" } });
  const isFirstNoShowStep = trigger === "NO_SHOW" && !last;
  const offsetHours = readOffsetHours(formData, isFirstNoShowStep ? 1 : 0);
  const channel = readChannel(trigger, formData);

  // Anexo não é suportado no canal WHATSAPP (Evolution API só manda texto
  // aqui, ver sendWhatsappMessage) — ignora qualquer arquivo enviado nesse
  // caso em vez de salvar um attachmentUrl que nunca vai ser usado.
  const file = channel === "WHATSAPP" ? null : await readAttachmentFile(formData);
  const attachmentUrl = file ? await saveUploadedAttachment(file, "follow-up") : null;

  await prisma.followUpStep.create({
    data: { trigger, order: (last?.order ?? -1) + 1, content, attachmentUrl, offsetHours, channel },
  });

  revalidatePath("/crm", "layout");
}

export async function updateFollowUpStep(stepId: string, formData: FormData) {
  await requireInternalSession();

  const content = String(formData.get("content") ?? "").trim();
  if (!content) throw new Error("O texto da mensagem é obrigatório.");

  const existing = await prisma.followUpStep.findUniqueOrThrow({ where: { id: stepId } });
  const isFirstNoShowStep = existing.trigger === "NO_SHOW" && existing.order === 0;
  const offsetHours = readOffsetHours(formData, isFirstNoShowStep ? 1 : 0);
  const channel = readChannel(existing.trigger, formData);

  const currentAttachmentUrl = String(formData.get("currentAttachmentUrl") ?? "").trim() || null;
  const removeAttachment = formData.get("removeAttachment") === "on";
  const file = channel === "WHATSAPP" ? null : await readAttachmentFile(formData);

  let attachmentUrl = currentAttachmentUrl;
  if (channel === "WHATSAPP") {
    // Trocar pra WHATSAPP num passo que já tinha anexo (ver comentário
    // acima) descarta o anexo antigo em vez de deixar uma URL órfã salva
    // sem nunca ser enviada.
    await deleteUploadedAttachment(currentAttachmentUrl);
    attachmentUrl = null;
  } else if (file) {
    attachmentUrl = await saveUploadedAttachment(file, "follow-up");
    await deleteUploadedAttachment(currentAttachmentUrl);
  } else if (removeAttachment) {
    await deleteUploadedAttachment(currentAttachmentUrl);
    attachmentUrl = null;
  }

  await prisma.followUpStep.update({ where: { id: stepId }, data: { content, attachmentUrl, offsetHours, channel } });
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

// Caixinha destacada da aba "Não compareceu", visualmente equivalente à
// "Considerar que o lead parou de responder depois de X horas" da aba
// "Parou de responder" — mas em vez de alimentar um FollowUpSettings
// global, edita direto o offsetHours do PRIMEIRO passo (order 0) da
// sequência NO_SHOW, que já existia dentro da lista de passos (só ficava
// escondido lá). Mínimo de 1 hora: é a janela que a secretária tem pra
// desfazer a marcação de "não compareceu" caso tenha clicado errado, ou o
// lead avise depois que só vai atrasar — sem isso, um valor 0 disparia a
// primeira mensagem de reengajamento assim que ela clicasse, mesmo que
// desfizesse a marcação em seguida.
export async function updateNoShowFirstStepDelay(formData: FormData) {
  await requireInternalSession();

  const offsetHours = readOffsetHours(formData, 1);

  const firstStep = await prisma.followUpStep.findFirst({
    where: { trigger: "NO_SHOW" },
    orderBy: { order: "asc" },
  });
  if (!firstStep) {
    throw new Error('Cadastre o Passo 1 da sequência de "não compareceu" antes de configurar esse prazo.');
  }

  await prisma.followUpStep.update({ where: { id: firstStep.id }, data: { offsetHours } });
  revalidatePath("/crm", "layout");
}

// Textos dos passos do card "Faltou" (D3/D10/D30, ver NoShowCardSettings/
// no-show-cards.ts) + "Não agendou" (D10/D30/D60, ver
// never-scheduled-cards.ts) + Reativação (5 textos em rodízio,
// reactivation.ts) + Quente (9
// textos, 3 por passo, hot-lead-cards.ts) — AGORA TODOS GLOBAIS (pedido
// explícito, "unificar os textos dos cards do Painel numa única tela
// GLOBAL"); Reativação/Quente eram por clínica antes disso (ver
// ReactivationConfig.message1-5/HotLeadConfig.stepXMessageY,
// schema.prisma — colunas e dados antigos mantidos intactos, só pararam
// de ser lidos). Vazio = usa o texto padrão de cada um. Aba "Cards do
// Painel" (FollowUpView.tsx) pedido explícito: 4 grupos recolhíveis, UM
// botão "Salvar textos" pros 4 juntos — por isso uma action só, gravando
// as QUATRO tabelas de configuração numa transação (cada uma continua
// separada — cards com regra de elegibilidade bem diferente — só a TELA
// os agrupa).
export async function updatePanelCardSettings(formData: FormData) {
  await requireInternalSession();

  function field(name: string): string | null {
    return String(formData.get(name) ?? "").trim() || null;
  }

  const day3Content = field("day3Content");
  const day10Content = field("day10Content");
  const day30Content = field("day30Content");
  const day60Content = field("day60Content");
  // Nomes de campo prefixados (ver comentário em FollowUpView.tsx) — sem
  // isso colidiriam com day30Content/day10Content do outro card no MESMO
  // <form>. noShowDay30Content = 3º passo do Faltou (item 1, rodada
  // atual); neverScheduledDay10Content = novo 3º passo do Não agendou
  // (item 2, rodada atual).
  const noShowDay30Content = field("noShowDay30Content");
  const neverScheduledDay10Content = field("neverScheduledDay10Content");

  const message1 = field("message1");
  const message2 = field("message2");
  const message3 = field("message3");
  const message4 = field("message4");
  const message5 = field("message5");

  const hotLeadFields = {
    step1Message1: field("step1Message1"),
    step1Message2: field("step1Message2"),
    step1Message3: field("step1Message3"),
    step2Message1: field("step2Message1"),
    step2Message2: field("step2Message2"),
    step2Message3: field("step2Message3"),
    step3Message1: field("step3Message1"),
    step3Message2: field("step3Message2"),
    step3Message3: field("step3Message3"),
  };

  await prisma.$transaction([
    prisma.noShowCardSettings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", day3Content, day10Content, day30Content: noShowDay30Content },
      update: { day3Content, day10Content, day30Content: noShowDay30Content },
    }),
    prisma.neverScheduledCardSettings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", day30Content, day60Content, day10Content: neverScheduledDay10Content },
      update: { day30Content, day60Content, day10Content: neverScheduledDay10Content },
    }),
    prisma.reactivationMessagesConfig.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", message1, message2, message3, message4, message5 },
      update: { message1, message2, message3, message4, message5 },
    }),
    prisma.hotLeadMessagesConfig.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ...hotLeadFields },
      update: hotLeadFields,
    }),
  ]);

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
