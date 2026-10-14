import { describe, it, expect } from "vitest";
import {
  buildResultPhotoMessages,
  CAPTION_TO_PHOTO_GAP_MS,
  canSendResultPhoto,
  findBestResultPhotoMatch,
  textMentionsRegisteredCategory,
  MAX_IMAGES_PER_CONVERSATION,
  type ResultPhotoGateInput,
  type ResultPhotoCandidate,
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

type Candidate = ResultPhotoCandidate & { imageUrl: string };

const CLINIC_DEMO_PHOTOS: Candidate[] = [
  { category: "botox", imageUrl: "https://x/botox.jpg", createdAt: new Date("2026-09-09T10:00:00.000Z") },
  { category: "Labial", imageUrl: "https://x/labial.jpg", createdAt: new Date("2026-09-09T10:01:00.000Z") },
  { category: "Harmonização", imageUrl: "https://x/harmonizacao.jpg", createdAt: new Date("2026-09-09T10:02:00.000Z") },
];

// Bug real reportado (Leonardo da Silva, 14/10): o modelo citou "botox"
// três vezes e nenhuma foto saiu — a busca antiga (categoria cadastrada
// CONTÉM o texto pedido, ver histórico de sendResultPhoto) exigia a
// palavra exata cadastrada. Estes testes cobrem exatamente o pedido do
// item 7: "rugas", "toxina botulínica", "BOTOX" e "Botox " (com espaço)
// têm que casar com a categoria "botox".
describe("findBestResultPhotoMatch", () => {
  it.each(["botox", "BOTOX", "Botox ", "rugas", "toxina botulínica", "linhas de expressão", "testa"])(
    "\"%s\" casa com a categoria cadastrada \"botox\"",
    (requested) => {
      const match = findBestResultPhotoMatch(requested, CLINIC_DEMO_PHOTOS);
      expect(match?.category).toBe("botox");
    }
  );

  it.each(["labial", "lábios", "boca"])("\"%s\" casa com a categoria cadastrada \"Labial\"", (requested) => {
    const match = findBestResultPhotoMatch(requested, CLINIC_DEMO_PHOTOS);
    expect(match?.category).toBe("Labial");
  });

  it.each(["harmonização", "harmonização facial"])(
    "\"%s\" casa com a categoria cadastrada \"Harmonização\"",
    (requested) => {
      const match = findBestResultPhotoMatch(requested, CLINIC_DEMO_PHOTOS);
      expect(match?.category).toBe("Harmonização");
    }
  );

  it("categoria sem nenhuma relação com as cadastradas devolve null (sem adivinhar)", () => {
    expect(findBestResultPhotoMatch("unha encravada", CLINIC_DEMO_PHOTOS)).toBeNull();
  });

  it("string vazia devolve null", () => {
    expect(findBestResultPhotoMatch("   ", CLINIC_DEMO_PHOTOS)).toBeNull();
  });

  it("lista de candidatas vazia devolve null", () => {
    expect(findBestResultPhotoMatch("botox", [])).toBeNull();
  });

  it("o mapa de sinônimo é só ajuda de casamento — nunca inventa uma foto que não existe", () => {
    // Sem nenhuma foto de botox cadastrada, "rugas"/"toxina botulínica" não
    // têm pra onde casar — nunca devolve a foto de outra categoria.
    const semBotox = CLINIC_DEMO_PHOTOS.filter((p) => p.category !== "botox");
    expect(findBestResultPhotoMatch("rugas", semBotox)).toBeNull();
    expect(findBestResultPhotoMatch("toxina botulínica", semBotox)).toBeNull();
  });

  it("em empate de pontuação, ganha a foto mais recente (mesmo critério de antes)", () => {
    const duplicadas: Candidate[] = [
      { category: "botox", imageUrl: "https://x/antiga.jpg", createdAt: new Date("2026-01-01T00:00:00.000Z") },
      { category: "botox", imageUrl: "https://x/nova.jpg", createdAt: new Date("2026-06-01T00:00:00.000Z") },
    ];
    expect(findBestResultPhotoMatch("botox", duplicadas)?.imageUrl).toBe("https://x/nova.jpg");
  });
});

// Item 4: um lote (debounce) que já cita um procedimento CADASTRADO não
// deve ser tratado como "primeira mensagem de um lead frio" — ver
// isFirstTurnEver em conversation-pipeline.ts.
describe("textMentionsRegisteredCategory", () => {
  const categories = ["botox", "Labial", "Harmonização"];

  it("menção literal à categoria cadastrada", () => {
    expect(textMentionsRegisteredCategory("Quero saber sobre botox", categories)).toBe(true);
  });

  it("menção por sinônimo cadastrado no mapa (rugas -> botox)", () => {
    expect(textMentionsRegisteredCategory("Percebo rugas na testa", categories)).toBe(true);
  });

  it("lote reproduzindo o caso real: 3 mensagens juntas, todas mencionando botox/rugas", () => {
    const batch = ["Percebo rugas", "Eu quero sabe a respeito do botox", "Vcs costumam fazer esse procedimento com botox?"].join(
      "\n"
    );
    expect(textMentionsRegisteredCategory(batch, categories)).toBe(true);
  });

  it("nenhuma menção a procedimento cadastrado — texto genérico de abertura", () => {
    expect(textMentionsRegisteredCategory("Oi, boa tarde! Vi o perfil de vocês no Instagram.", categories)).toBe(false);
  });

  it("sinônimo de uma categoria NÃO cadastrada não conta (nunca libera o gate pra algo que não existe)", () => {
    expect(textMentionsRegisteredCategory("Quero saber sobre botox", ["Labial", "Harmonização"])).toBe(false);
  });

  it("lista de categorias vazia nunca conta como menção", () => {
    expect(textMentionsRegisteredCategory("Quero fazer botox", [])).toBe(false);
  });

  it("texto vazio nunca conta como menção", () => {
    expect(textMentionsRegisteredCategory("", categories)).toBe(false);
  });
});
