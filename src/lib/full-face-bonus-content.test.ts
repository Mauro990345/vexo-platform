import { describe, expect, it } from "vitest";
import {
  BONUS_STEPS,
  BONUS_SCREENS,
  BONUS_CHECKLIST,
  BONUS_MESSAGES,
  BONUS_OVERVIEW,
  adjacentBonusScreen,
  canViewFullFaceBonus,
} from "./full-face-bonus-content";

describe("Bônus Full Face — conteúdo", () => {
  it("tem 7 passos numerados em ordem, cada um com ideia, frase, roteiro e ações", () => {
    expect(BONUS_STEPS.map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const s of BONUS_STEPS) {
      expect(s.idea.length).toBeGreaterThan(0);
      expect(s.phrase.length).toBeGreaterThan(0);
      expect(s.blocks.length).toBeGreaterThan(0);
      expect(s.actions.length).toBeGreaterThan(0);
      for (const b of s.blocks) {
        expect(b.items.length).toBeGreaterThan(0);
        expect(b.media).toBeUndefined();
      }
    }
  });

  it("passo 2 tem os dois subtítulos internos; passo 4 tem 2 blocos com título e nota da frase", () => {
    const p2 = BONUS_STEPS[1]!.blocks[0]!.items.filter((i) => i.type === "subtitle").map((i) => i.text);
    expect(p2).toEqual(["Cinco ideias para mudar", "A postura em três atitudes"]);
    const p4 = BONUS_STEPS[3]!;
    expect(p4.blocks.map((b) => b.title)).toEqual(["Parte 1. Abra a consulta", "Parte 2. Construa o plano"]);
    expect(p4.phraseNote).toBeTruthy();
    expect(p4.actions).toHaveLength(4);
    expect(BONUS_STEPS.filter((s) => s.phraseNote)).toHaveLength(1);
  });

  it("não fala em áudio enquanto não houver áudio", () => {
    expect(BONUS_OVERVIEW.subtitle).toContain("um roteiro para ler,");
    expect(BONUS_OVERVIEW.subtitle).not.toContain("ouvir");
  });

  it("checklist 4/6/3 e 4 modelos de mensagem", () => {
    expect(BONUS_CHECKLIST.map((g) => g.items.length)).toEqual([4, 6, 3]);
    expect(BONUS_MESSAGES).toHaveLength(4);
  });

  it("navegação: visão geral → passos 1..7 → checklist", () => {
    expect(BONUS_SCREENS).toHaveLength(9);
    expect(adjacentBonusScreen("overview", -1)).toBeNull();
    expect(adjacentBonusScreen("overview", 1)).toBe("step-1");
    expect(adjacentBonusScreen("step-7", 1)).toBe("checklist");
    expect(adjacentBonusScreen("checklist", 1)).toBeNull();
  });

  it("acesso: cliente só com o interruptor ligado; interno sempre", () => {
    expect(canViewFullFaceBonus({ internal: false, enabled: false })).toBe(false);
    expect(canViewFullFaceBonus({ internal: false, enabled: true })).toBe(true);
    expect(canViewFullFaceBonus({ internal: true, enabled: false })).toBe(true);
  });
});
