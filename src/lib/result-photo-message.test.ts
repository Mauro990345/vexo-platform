import { describe, it, expect } from "vitest";
import { buildResultPhotoMessages, CAPTION_TO_PHOTO_GAP_MS } from "./result-photo-message";

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
