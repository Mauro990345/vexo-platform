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
