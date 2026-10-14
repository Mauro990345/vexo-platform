// Decide como as mensagens de "foto de resultado" (antes/depois, ver
// ResultPhoto no schema e send_result_photo em src/lib/anthropic.ts) saem
// pro lead — puro/testável sem tocar Prisma, seguindo o mesmo padrão de
// conversation-context.ts (lógica de decisão separada da orquestração que
// grava no banco, que fica em conversation-pipeline.ts).
//
// Sem legenda cadastrada (ResultPhoto.caption vazio/null — inclusive toda
// foto cadastrada antes desse campo existir): comportamento IDÊNTICO ao
// de antes, só a foto sozinha. Com legenda: a legenda sai como mensagem de
// texto própria, alguns segundos ANTES da foto — nunca junto/depois —
// porque é isso que dá pro lead ler o contexto ("separei um resultado
// parecido com o que você quer") antes da imagem chegar, em vez de receber
// uma imagem sem explicação nenhuma.

export type ResultPhotoInput = {
  imageUrl: string;
  caption: string | null;
};

// Regra nova (substitui o limite antigo de 1 por conversa/fôlego):
// contando as já enviadas no fôlego atual (ver resultPhotoBreathStart,
// conversation-pipeline.ts), no máximo esse número de fotos — a mesma foto
// nunca se repete, e nunca mais de uma é enviada no mesmo turno, mesmo
// dentro do limite. Aplicado em código (send_result_photo), nunca no
// aiSystemPrompt — ver canSendResultPhoto, abaixo.
export const MAX_IMAGES_PER_CONVERSATION = 2;

export type ResultPhotoGateInput = {
  // Nenhuma Message de AI foi enviada ainda nesta conversa — "entrada
  // sutil" pedida: nunca manda foto na primeira mensagem de um lead frio,
  // mesmo que a categoria exista e o limite ainda não tenha sido atingido.
  isFirstTurnEver: boolean;
  // Já saiu uma foto de resultado NESTE MESMO turno (chamada anterior de
  // send_result_photo dentro do mesmo generateLeadReply) — nunca duas no
  // mesmo turno, mesmo que o limite da conversa ainda não tenha sido
  // atingido.
  alreadySentThisTurn: boolean;
  // URLs das fotos já enviadas no fôlego atual desta conversa (ver
  // resultPhotoBreathStart) — usado tanto pra contar o limite quanto pra
  // nunca repetir a mesma imagem.
  alreadySentImageUrls: string[];
  // ResultPhoto.imageUrl da foto que a ferramenta está tentando enviar
  // agora (já resolvida pela categoria, ver sendResultPhoto).
  candidateImageUrl: string;
};

export type ResultPhotoGateDecision = { allowed: true } | { allowed: false; reason: string };

// Pura/testável sem Prisma — a orquestração (consultar o histórico de
// Message, decidir o início do fôlego) fica em conversation-pipeline.ts,
// mesmo padrão de buildResultPhotoMessages/buildAvailabilityCheck.
export function canSendResultPhoto(input: ResultPhotoGateInput): ResultPhotoGateDecision {
  if (input.isFirstTurnEver) {
    return {
      allowed: false,
      reason:
        "Não envie foto de resultado na primeira mensagem de um lead novo — espere ele demonstrar interesse em algum procedimento antes.",
    };
  }
  if (input.alreadySentThisTurn) {
    return {
      allowed: false,
      reason: "Só é permitido enviar uma foto de resultado por turno — não chame esta ferramenta de novo agora.",
    };
  }
  if (input.alreadySentImageUrls.includes(input.candidateImageUrl)) {
    return {
      allowed: false,
      reason: "Esta foto específica já foi enviada nesta conversa — não repita a mesma imagem.",
    };
  }
  if (input.alreadySentImageUrls.length >= MAX_IMAGES_PER_CONVERSATION) {
    return {
      allowed: false,
      reason: `Limite de ${MAX_IMAGES_PER_CONVERSATION} fotos de resultado por conversa já atingido — siga sem enviar foto.`,
    };
  }
  return { allowed: true };
}

export type OutboundMessageDraft = {
  content: string;
  mediaUrl?: string;
  scheduledFor: Date;
};

// Mesmo espaçamento de 5s já usado entre a resposta em texto da IA e a
// foto (ver conversation-pipeline.ts) e entre texto+anexo de um mesmo
// passo de follow-up (ver dispatchFollowUpSteps, src/lib/follow-up.ts) —
// tempo suficiente pro lead perceber que são duas mensagens em sequência,
// sem ficar um intervalo estranho entre elas.
export const CAPTION_TO_PHOTO_GAP_MS = 5_000;

export function buildResultPhotoMessages(photo: ResultPhotoInput, baseScheduledFor: Date): OutboundMessageDraft[] {
  const caption = photo.caption?.trim();

  const photoMessage: OutboundMessageDraft = {
    content: "[foto de resultado]",
    mediaUrl: photo.imageUrl,
    scheduledFor: caption ? new Date(baseScheduledFor.getTime() + CAPTION_TO_PHOTO_GAP_MS) : baseScheduledFor,
  };

  if (!caption) {
    return [photoMessage];
  }

  return [{ content: caption, scheduledFor: baseScheduledFor }, photoMessage];
}
