import { describe, it, expect } from "vitest";
import { detectStagnation, STAGNATION_SIMILARITY_THRESHOLD, STAGNATION_WINDOW_SIZE } from "./loop-guard";

describe("detectStagnation", () => {
  it("não marca como estagnada com menos de 2 mensagens", () => {
    expect(detectStagnation([]).stuck).toBe(false);
    expect(detectStagnation(["oi"]).stuck).toBe(false);
  });

  it("marca como estagnada quando a IA repete a mesma mensagem várias vezes seguidas (loop de bot literal)", () => {
    const texts = Array(STAGNATION_WINDOW_SIZE).fill(
      "Oi! Temos horários disponíveis na quinta-feira, manhã ou tarde. Qual prefere?"
    );
    const result = detectStagnation(texts);
    expect(result.stuck).toBe(true);
    expect(result.avgSimilarity).toBeCloseTo(1, 5);
  });

  it("marca como estagnada num loop alternado A/B/A/B (não só repetição consecutiva idêntica)", () => {
    const a = "O horário de quinta ainda está disponível pra você confirmar.";
    const b = "O horário de quinta ainda está disponível, é só você confirmar.";
    const texts = [a, b, a, b, a];
    const result = detectStagnation(texts);
    expect(result.stuck).toBe(true);
    expect(result.avgSimilarity).toBeGreaterThan(0.6);
  });

  it("NÃO marca como estagnada numa conversa avançando de verdade (conteúdo novo a cada mensagem)", () => {
    const texts = [
      "Oi! Tudo bem? Você chegou a pensar em fazer o procedimento com a gente?",
      "Legal! Pra te passar os horários certinhos, você prefere período da manhã ou da tarde?",
      "De manhã temos quinta-feira às 9h ou sexta-feira às 10h — qual fica melhor pra você?",
      "Perfeito, fica reservado quinta-feira às 9h então! Só preciso do seu WhatsApp pra te enviar a confirmação.",
      "Show, recebi seu número! Vou te mandar um vídeo rápido mostrando como funciona o atendimento.",
    ];
    const result = detectStagnation(texts);
    expect(result.stuck).toBe(false);
  });

  it("respeita um threshold customizado passado via options", () => {
    const texts = [
      "Temos horário quinta de manhã, prefere esse?",
      "Temos horário quinta à tarde, prefere esse?",
    ];
    const permissive = detectStagnation(texts, { threshold: 0.99 });
    const strict = detectStagnation(texts, { threshold: 0.1 });
    expect(permissive.stuck).toBe(false);
    expect(strict.stuck).toBe(true);
    expect(permissive.avgSimilarity).toBe(strict.avgSimilarity);
  });

  it("ignora acentuação, maiúsculas e pontuação na comparação", () => {
    const texts = ["Você já decidiu o dia?!", "voce ja decidiu o dia"];
    const result = detectStagnation(texts, { threshold: STAGNATION_SIMILARITY_THRESHOLD });
    expect(result.avgSimilarity).toBeCloseTo(1, 5);
  });

  it("calcula a similaridade média sobre TODOS os pares da janela, não só consecutivos", () => {
    const texts = ["um dois tres", "quatro cinco seis", "um dois tres"];
    const result = detectStagnation(texts, { threshold: 0.5 });
    // pares: (0,1)=0, (0,2)=1, (1,2)=0 -> média = 1/3
    expect(result.pairSimilarities).toHaveLength(3);
    expect(result.avgSimilarity).toBeCloseTo(1 / 3, 5);
  });
});
