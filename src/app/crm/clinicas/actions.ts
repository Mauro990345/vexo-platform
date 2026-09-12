"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireInternalSession } from "@/lib/session";
import { setAppointmentAttendance } from "@/lib/appointments";
import { disconnectWhatsapp, renameWhatsappInstance, resetWhatsappInstanceName } from "@/lib/whatsapp-connection";
import { disconnectGoogleCalendar } from "@/lib/google-calendar";
import {
  disconnectInstagram,
  subscribeInstagramWebhook,
  verifyInstagramTokenAndId,
  tokenFingerprint,
  getSubscribedFields,
} from "@/lib/instagram";
import { decryptToken } from "@/lib/crypto";
import { saveUploadedAttachment, deleteUploadedAttachment } from "@/lib/uploads";

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
  const address = String(formData.get("address") ?? "").trim() || null;

  const slug = slugify(name) + "-" + Math.random().toString(36).slice(2, 6);

  const clinic = await prisma.clinic.create({
    data: {
      name,
      slug,
      address,
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

// Exclusão definitiva — usada na lista de "Contas" (ClinicSearchList).
// Desconecta as integrações externas antes (best-effort: uma falha ao
// revogar um token não deve impedir a exclusão, já que o objetivo é a
// clínica sumir da plataforma de qualquer forma). O resto — leads,
// conversas, mensagens, agendamentos, usuários, logs de follow-up etc. —
// some sozinho via onDelete: Cascade em todas as relações de Clinic no
// schema, não precisa apagar manualmente tabela por tabela.
export async function deleteClinic(clinicId: string) {
  await requireInternalSession();

  try {
    await disconnectInstagram(clinicId);
  } catch (err) {
    console.error("[vexo] Falha ao desconectar Instagram antes de excluir clínica:", err);
  }
  try {
    await disconnectGoogleCalendar(clinicId);
  } catch (err) {
    console.error("[vexo] Falha ao desconectar Google Calendar antes de excluir clínica:", err);
  }
  try {
    await disconnectWhatsapp(clinicId);
  } catch (err) {
    console.error("[vexo] Falha ao desconectar WhatsApp antes de excluir clínica:", err);
  }

  await prisma.clinic.delete({ where: { id: clinicId } });

  revalidatePath("/crm");
}

// Config da IA/agente — separada de updateClinicSettings (abaixo) pra viver
// na própria página "Agente de IA" sem arriscar sobrescrever os campos que
// ficaram em "Automações" quando os dois formulários salvam em momentos
// diferentes.
export async function updateAiAgentSettings(clinicId: string, formData: FormData) {
  await requireInternalSession();

  const aiSystemPrompt = String(formData.get("aiSystemPrompt") ?? "").trim() || null;
  const notifyWhatsappNumber = String(formData.get("notifyWhatsappNumber") ?? "").trim() || null;

  // Mesmo padrão de upload do anexo de follow-up (ver
  // src/app/crm/(global)/follow-up/actions.ts): campo de arquivo em vez de
  // URL colada — troca o vídeo mantendo a URL atual se nada for enviado, e
  // limpa o arquivo antigo do disco quando substituído ou removido.
  const currentConfirmationVideoUrl = String(formData.get("currentConfirmationVideoUrl") ?? "").trim() || null;
  const removeConfirmationVideo = formData.get("removeConfirmationVideo") === "on";
  const confirmationVideoFile = formData.get("confirmationVideoFile");
  const file = confirmationVideoFile instanceof File && confirmationVideoFile.size > 0 ? confirmationVideoFile : null;

  let confirmationVideoUrl = currentConfirmationVideoUrl;
  if (file) {
    confirmationVideoUrl = await saveUploadedAttachment(file, "confirmation-video");
    await deleteUploadedAttachment(currentConfirmationVideoUrl);
  } else if (removeConfirmationVideo) {
    await deleteUploadedAttachment(currentConfirmationVideoUrl);
    confirmationVideoUrl = null;
  }

  await prisma.clinic.update({
    where: { id: clinicId },
    data: { aiSystemPrompt, confirmationVideoUrl, notifyWhatsappNumber },
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
  if (!Number.isFinite(firstBandDelaySeconds) || firstBandDelaySeconds < 5 || firstBandDelaySeconds > 60) {
    throw new Error("O delay da faixa de até 1h precisa ser entre 5 e 60 segundos.");
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

  const address = String(formData.get("address") ?? "").trim() || null;
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
  const firstMessageTemplate = String(formData.get("firstMessageTemplate") ?? "").trim() || null;
  const secondMessageTemplate = String(formData.get("secondMessageTemplate") ?? "").trim() || null;

  await prisma.clinic.update({
    where: { id: clinicId },
    data: {
      address,
      clientWhatsappNumber,
      active,
      reminderConfig: {
        upsert: {
          create: { hoursBefore, firstMessageTemplate, secondMessageTemplate },
          update: { hoursBefore, firstMessageTemplate, secondMessageTemplate },
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
  revalidatePath(`/crm/clinicas/${clinicId}/painel`);
  return { error: null };
}

export async function removeClientLogin(clinicId: string, userId: string) {
  await requireInternalSession();

  // Só remove se o usuário realmente pertencer a essa clínica e for CLIENT —
  // evita que o formulário seja usado pra apagar qualquer usuário por id.
  await prisma.user.deleteMany({ where: { id: userId, clinicId, role: "CLIENT" } });

  revalidatePath("/crm/painel");
  revalidatePath(`/crm/clinicas/${clinicId}`);
  revalidatePath(`/crm/clinicas/${clinicId}/painel`);
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
// plataforma no dia a dia — por isso fica exposta direto no Painel dela
// (ver NoShowButton), nunca atrás de configuração. Não é exposta na tela
// de conversa (uso do Mauro): comparecimento e remarcação são decisão da
// secretária com o próprio lead, nunca do Mauro. Reversível: clicar na
// opção já marcada desmarca; clicar na outra troca direto.
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

// Corrige contas já conectadas ANTES da inscrição no webhook por conta
// (subscribeInstagramWebhook em src/lib/instagram.ts) ter passado a rodar
// no callback do OAuth — sem essa chamada extra, a conta autoriza e salva
// o token normalmente, mas a Meta nunca manda evento nenhum de mensagem
// recebida (o toggle "Webhook Subscription" do App Dashboard só configura
// o app, não inscreve cada conta). Pra essas contas antigas, refazer todo
// o OAuth de novo não é necessário: o token já salvo ainda é válido, só
// falta essa chamada — daqui dá pra rodar ela sozinha, sem desconectar.
export async function resubscribeInstagramWebhookAction(clinicId: string) {
  await requireInternalSession();

  const conexoesPath = `/crm/clinicas/${clinicId}/conexoes`;
  const account = await prisma.instagramAccount.findUnique({ where: { clinicId } });
  if (!account) {
    redirect(`${conexoesPath}?status=erro&channel=instagram&reason=${encodeURIComponent("Instagram não está conectado nesta clínica.")}`);
  }

  const accessToken = decryptToken(account.accessTokenEnc);

  // Diagnóstico antes do subscribe em si: um GET simples (sem side effect),
  // endereçando a própria conta como "me" (não pelo igUserId numérico — ver
  // comentário grande em verifyInstagramTokenAndId, src/lib/instagram.ts,
  // sobre por que isso importa nesse produto específico). Isola se um erro
  // no subscribe é o token em si sendo inválido (essa leitura falha do
  // mesmo jeito) ou é específico do endpoint /subscribed_apps (essa
  // leitura funciona, só o subscribe falha).
  let profileCheck: { id: string; username?: string };
  try {
    profileCheck = await verifyInstagramTokenAndId(accessToken);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    // Se até "me" falhar, o suspeito deixa de ser o endereçamento (ID vs.
    // "me") e passa a ser o token salvo em si — fingerprint (nunca o
    // token inteiro) junto do erro pra comparar contra outro log/print,
    // sem token exposto por completo em lugar nenhum.
    redirect(
      `${conexoesPath}?status=erro&channel=instagram&reason=${encodeURIComponent(
        `Leitura de diagnóstico falhou mesmo usando "me" (token inválido/expirado/corrompido — ${tokenFingerprint(accessToken)}): ${detail}`
      )}`
    );
  }

  try {
    await subscribeInstagramWebhook(accessToken);
  } catch (err) {
    // Mesmo espírito do callback do OAuth: detalhe técnico completo aqui,
    // já que esse botão só existe na tela interna e só admin com sessão
    // chega até ele (requireInternalSession acima já barra o resto).
    // Prefixo deixa explícito que a leitura funcionou — a falha é
    // específica do /subscribed_apps, não do par token/ID em si.
    const detail = err instanceof Error ? err.message : String(err);
    redirect(
      `${conexoesPath}?status=erro&channel=instagram&reason=${encodeURIComponent(
        `Leitura OK (id=${profileCheck.id}, username=${profileCheck.username ?? "?"}), mas o subscribe falhou: ${detail}`
      )}`
    );
  }

  // NÃO grava profileCheck.id como igUserId aqui (chegou a fazer isso —
  // removido). Uma conta real em produção provou que /me devolve um "id"
  // que NÃO é o mesmo namespace que o webhook manda em entry.id/
  // recipient.id (ver comentário grande em exchangeInstagramCode, src/
  // lib/instagram.ts) — esse "self-heal" automático só ficava reescrevendo
  // o valor salvo por um outro valor IGUALMENTE errado pra fins de casar
  // com o webhook (na prática, os dois vêm do mesmo namespace errado). A
  // correção do ID usado pra casar com o webhook agora é manual, feita
  // com o valor observado de verdade num evento real (ver
  // setInstagramWebhookIdAction abaixo e /crm/webhook-logs).
  revalidatePath(conexoesPath);
  redirect(`${conexoesPath}?status=webhook-ok`);
}

// Diagnóstico: o subscribe (ação acima) só confirma que a Meta ACEITOU o
// POST — não confirma quais campos ficaram realmente inscritos. Já
// aconteceu de um subscribe "bem-sucedido" não resultar em entrega de
// mensagem nenhuma; essa leitura elimina a dúvida, consultando a lista
// de verdade (ver getSubscribedFields em src/lib/instagram.ts).
export async function checkInstagramWebhookSubscriptionAction(clinicId: string) {
  await requireInternalSession();

  const conexoesPath = `/crm/clinicas/${clinicId}/conexoes`;
  const account = await prisma.instagramAccount.findUnique({ where: { clinicId } });
  if (!account) {
    redirect(`${conexoesPath}?status=erro&channel=instagram&reason=${encodeURIComponent("Instagram não está conectado nesta clínica.")}`);
  }

  // redirect() (next/navigation) lança um erro especial (NEXT_REDIRECT)
  // internamente pra interromper a execução — chamar ele DENTRO do try
  // faz esse próprio throw cair no catch logo abaixo, tratado como se
  // fosse uma falha real de getSubscribedFields (era exatamente o bug
  // reportado: banner de erro mostrando "NEXT_REDIRECT" no lugar da
  // lista de campos). Por isso o redirect de sucesso fica DEPOIS do
  // try/catch, nunca dentro dele — mesmo padrão já usado (certo) em
  // resubscribeInstagramWebhookAction logo acima.
  let fields: string[];
  try {
    fields = await getSubscribedFields(decryptToken(account.accessTokenEnc));
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    redirect(`${conexoesPath}?status=erro&channel=instagram&reason=${encodeURIComponent(detail)}`);
  }

  redirect(`${conexoesPath}?status=webhook-fields&fields=${encodeURIComponent(fields.join(", ") || "(nenhum)")}`);
}

// Correção manual do igUserId usado pra casar evento de webhook recebido
// com a conta salva (ver handleInboundInstagramMessage,
// conversation-pipeline.ts). Existe porque NENHUM endpoint acessível no
// fluxo de OAuth desse produto (api.instagram.com/oauth/access_token,
// graph.instagram.com/me — já tentados os dois) devolve o mesmo ID que a
// Meta manda de verdade em entry.id/recipient.id nos webhooks; o único
// jeito confiável de saber esse valor é observando um evento real (ver
// matchFailureReason em /crm/webhook-logs, que mostra o ID recebido
// quando não bate com nada salvo).
//
// formData.get("igUserId") é tratado como STRING do início ao fim — nunca
// convertido pra Number em nenhuma etapa (nem validação, nem log, nem
// comparação) — só validado como sequência de dígitos via regex, já que é
// exatamente esse tipo de conversão implícita (JSON.parse/Number em algum
// ponto do caminho) que already causou perda de precisão nesse mesmo
// campo mais de uma vez neste projeto.
export async function setInstagramWebhookIdAction(clinicId: string, formData: FormData) {
  await requireInternalSession();

  const conexoesPath = `/crm/clinicas/${clinicId}/conexoes`;
  const igUserId = String(formData.get("igUserId") ?? "").trim();

  if (!/^\d+$/.test(igUserId)) {
    redirect(
      `${conexoesPath}?status=erro&channel=instagram&reason=${encodeURIComponent(
        `ID inválido — precisa ser só dígitos (recebido: "${igUserId}").`
      )}`
    );
  }

  const account = await prisma.instagramAccount.findUnique({ where: { clinicId } });
  if (!account) {
    redirect(`${conexoesPath}?status=erro&channel=instagram&reason=${encodeURIComponent("Instagram não está conectado nesta clínica.")}`);
  }

  await prisma.instagramAccount.update({ where: { clinicId }, data: { igUserId } });
  revalidatePath(conexoesPath);
  redirect(`${conexoesPath}?status=webhook-ok&idFixed=${encodeURIComponent(`${account.igUserId} → ${igUserId}`)}`);
}

export async function renameWhatsappInstanceAction(clinicId: string, formData: FormData) {
  await requireInternalSession();
  const instanceName = String(formData.get("instanceName") ?? "");
  await renameWhatsappInstance(clinicId, instanceName);
  revalidatePath(`/crm/clinicas/${clinicId}/whatsapp`);
}

export async function resetWhatsappInstanceNameAction(clinicId: string) {
  await requireInternalSession();
  await resetWhatsappInstanceName(clinicId);
  revalidatePath(`/crm/clinicas/${clinicId}/whatsapp`);
}

export async function disconnectWhatsappAction(clinicId: string) {
  await requireInternalSession();
  await disconnectWhatsapp(clinicId);
  revalidatePath(`/crm/clinicas/${clinicId}/whatsapp`);
  revalidatePath(`/crm/clinicas/${clinicId}`);
  revalidatePath("/crm");
}

// Fotos de resultado (antes/depois) usadas pela IA via send_result_photo
// (ver src/lib/anthropic.ts e conversation-pipeline.ts) — mesma
// infraestrutura de upload do vídeo de confirmação, subdir própria.
export async function addResultPhoto(clinicId: string, formData: FormData) {
  await requireInternalSession();

  const category = String(formData.get("category") ?? "").trim();
  if (!category) throw new Error("Categoria é obrigatória.");

  const file = formData.get("photoFile");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Selecione uma foto.");
  }

  const imageUrl = await saveUploadedAttachment(file, "result-photos");

  await prisma.resultPhoto.create({
    data: { clinicId, category, imageUrl },
  });

  revalidatePath(`/crm/clinicas/${clinicId}/fotos`);
}

export async function deleteResultPhoto(clinicId: string, photoId: string) {
  await requireInternalSession();

  const photo = await prisma.resultPhoto.findUnique({ where: { id: photoId } });
  if (!photo || photo.clinicId !== clinicId) return;

  await prisma.resultPhoto.delete({ where: { id: photoId } });
  await deleteUploadedAttachment(photo.imageUrl);

  revalidatePath(`/crm/clinicas/${clinicId}/fotos`);
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
