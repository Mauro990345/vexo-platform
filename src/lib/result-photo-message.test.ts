import { describe, it, expect } from "vitest";
import {
  buildResultPhotoMessages,
  CAPTION_TO_PHOTO_GAP_MS,
  canSendResultPhoto,
  MAX_IMAGES_PER_CONVERSATION,
  type ResultPhotoGateInput,
} from "./result-photo-message";

const BASE = new Date("2026-09-18T12:00:00.000Z");

describe("buildResultPhotoMessages", () => {
  it("sem legenda: manda só a foto, no horário base — comportamento idêntico ao de antes desse campo existir", () => {
    const messages = buildResultPhotoMessages({ imageUrl: "https://x/foto.jpg", caption: null }, BASE);

    expect(messages).toEqual([{ content: "[foto de resultado]", mediaUrl: "https://x/foto.jpg", scheduledFor: BASE }]);
  });

  it("legenda vazia (string em branco) é tratada como sem legenda", () => {
    const messages = buildResultPhotoMessages({ imageUrl: "https://x/foto.jpg", caption: "   " }, BASE);

    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toBe("[foto de resultado]");
  });

  it("com legenda: manda a legenda primeiro, no horário base, e a foto alguns segundos depois", () => {
    const messages = buildResultPhotoMessages(
      { imageUrl: "https://x/foto.jpg", caption: "Separei um resultado real de um procedimento parecido com o que você quer" },
      BASE
    );

    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({
      content: "Separei um resultado real de um procedimento parecido com o que você quer",
      scheduledFor: BASE,
    });
    expect(messages[1]).toEqual({
      content: "[foto de resultado]",
      mediaUrl: "https://x/foto.jpg",
      scheduledFor: new Date(BASE.getTime() + CAPTION_TO_PHOTO_GAP_MS),
    });
  });

  it("legenda com espaços nas pontas é enviada já sem eles", () => {
    const messages = buildResultPhotoMessages({ imageUrl: "https://x/foto.jpg", caption: "  Olha só esse resultado!  " }, BASE);

    expect(messages[0]?.content).toBe("Olha só esse resultado!");
  });

  it("a foto nunca sai antes da legenda", () => {
    const messages = buildResultPhotoMessages({ imageUrl: "https://x/foto.jpg", caption: "Contexto antes da imagem" }, BASE);

    const [captionMsg, photoMsg] = messages;
    expect(captionMsg!.scheduledFor.getTime()).toBeLessThan(photoMsg!.scheduledFor.getTime());
  });
});

function gate(overrides: Partial<ResultPhotoGateInput> = {}): ResultPhotoGateInput {
  return {
    isFirstTurnEver: false,
    alreadySentThisTurn: false,
    alreadySentImageUrls: [],
    candidateImageUrl: "https://x/botox.jpg",
    ...overrides,
  };
}

describe("canSendResultPhoto", () => {
  it("permite quando não é o primeiro turno, nada foi enviado ainda neste turno/conversa", () => {
    expect(canSendResultPhoto(gate())).toEqual({ allowed: true });
  });

  it("NUNCA permite na primeira mensagem de um lead frio, mesmo sem nenhuma foto enviada ainda", () => {
    const result = canSendResultPhoto(gate({ isFirstTurnEver: true }));
    expect(result.allowed).toBe(false);
    expect((result as { reason: string }).reason).toMatch(/primeira mensagem/i);
  });

  it("NUNCA permite uma 2ª foto no mesmo turno, mesmo com o limite da conversa longe de ser atingido", () => {
    const result = canSendResultPhoto(gate({ alreadySentThisTurn: true, alreadySentImageUrls: [] }));
    expect(result.allowed).toBe(false);
    expect((result as { reason: string }).reason).toMatch(/uma foto de resultado por turno/i);
  });

  it("nunca repete a mesma foto já enviada nesta conversa, mesmo dentro do limite", () => {
    const result = canSendResultPhoto(
      gate({ alreadySentImageUrls: ["https://x/botox.jpg"], candidateImageUrl: "https://x/botox.jpg" })
    );
    expect(result.allowed).toBe(false);
    expect((result as { reason: string }).reason).toMatch(/já foi enviada/i);
  });

  it("permite uma foto DIFERENTE quando só 1 das 2 já foi enviada", () => {
    const result = canSendResultPhoto(
      gate({ alreadySentImageUrls: ["https://x/labial.jpg"], candidateImageUrl: "https://x/botox.jpg" })
    );
    expect(result).toEqual({ allowed: true });
  });

  it(`bloqueia a partir de MAX_IMAGES_PER_CONVERSATION (${MAX_IMAGES_PER_CONVERSATION}) fotos distintas já enviadas`, () => {
    const alreadySentImageUrls = Array.from({ length: MAX_IMAGES_PER_CONVERSATION }, (_, i) => `https://x/foto-${i}.jpg`);
    const result = canSendResultPhoto(gate({ alreadySentImageUrls, candidateImageUrl: "https://x/foto-nova.jpg" }));
    expect(result.allowed).toBe(false);
    expect((result as { reason: string }).reason).toMatch(new RegExp(`Limite de ${MAX_IMAGES_PER_CONVERSATION}`));
  });

  it("permite a 2ª foto distinta quando só 1 foi enviada (dentro do limite de 2)", () => {
    const result = canSendResultPhoto(
      gate({ alreadySentImageUrls: ["https://x/labial.jpg"], candidateImageUrl: "https://x/harmonizacao.jpg" })
    );
    expect(result).toEqual({ allowed: true });
  });
});
