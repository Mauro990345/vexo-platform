import { describe, expect, it } from "vitest";
import {
  normalizeApproachUsername,
  firstNameOf,
  parseCsvRows,
  resolveApproachUploadRows,
  parseApproachUsernamesTxt,
  isWithinApproachHours,
  formatApproachWindowLabel,
  parseApproachTimeToMinutes,
  validateApproachWindow,
  startOfApproachDay,
  randomApproachWaitMs,
  formatApproachCountdown,
  APPROACH_WAIT_MIN_MS,
  APPROACH_WAIT_MAX_MS,
  resolveAvailableApproachSlots,
  pickNextApproachMessageSlot,
  fillApproachMessageTemplate,
  computeApproachAccountState,
} from "./approach-queue";

describe("normalizeApproachUsername", () => {
  it("minúsculo, sem @, sem espaço nas pontas", () => {
    expect(normalizeApproachUsername("  @Fulano.Silva  ")).toBe("fulano.silva");
    expect(normalizeApproachUsername("fulano.silva")).toBe("fulano.silva");
    expect(normalizeApproachUsername("@@fulano")).toBe("fulano");
  });
});

describe("firstNameOf", () => {
  it("primeiro nome só", () => {
    expect(firstNameOf("Maria Clara Souza")).toBe("Maria");
    expect(firstNameOf("  Ana  ")).toBe("Ana");
  });
  it("null/vazio -> null", () => {
    expect(firstNameOf(null)).toBeNull();
    expect(firstNameOf(undefined)).toBeNull();
    expect(firstNameOf("   ")).toBeNull();
  });
});

describe("parseCsvRows", () => {
  it("separa por vírgula, linhas por quebra", () => {
    expect(parseCsvRows("usuario,nome\nfulano.ig,Fulano\nciclana.ig,Ciclana")).toEqual([
      ["usuario", "nome"],
      ["fulano.ig", "Fulano"],
      ["ciclana.ig", "Ciclana"],
    ]);
  });
  it("suporta campo entre aspas com vírgula e aspas escapadas", () => {
    expect(parseCsvRows('usuario,nome\nfulano.ig,"Silva, Fulano ""Jr"""')).toEqual([
      ["usuario", "nome"],
      ["fulano.ig", 'Silva, Fulano "Jr"'],
    ]);
  });
  it("ignora \\r e linhas em branco", () => {
    expect(parseCsvRows("a,b\r\n\r\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
});

describe("resolveApproachUploadRows", () => {
  it("detecta colunas pelo cabeçalho (usuário/nome em qualquer ordem)", () => {
    const rows = [
      ["Nome", "Usuário"],
      ["Fulano", "fulano.ig"],
      ["Ciclana", "@ciclana.ig"],
    ];
    expect(resolveApproachUploadRows(rows)).toEqual([
      { username: "fulano.ig", name: "Fulano" },
      { username: "@ciclana.ig", name: "Ciclana" },
    ]);
  });
  it("sem cabeçalho reconhecido, trata como lista de @ (1ª coluna, sem nome) — inclusive a 1ª linha", () => {
    const rows = [
      ["fulano.ig", "Fulano"],
      ["ciclana.ig", "Ciclana"],
    ];
    expect(resolveApproachUploadRows(rows)).toEqual([
      { username: "fulano.ig", name: null },
      { username: "ciclana.ig", name: null },
    ]);
  });
  it("regressão: um @ real contendo 'user'/'nome' como pedaço do texto NUNCA é tratado como cabeçalho (match é sempre exato, nunca substring)", () => {
    // Bug real: 3 leads enviados, só 1 chegou na fila — a 1ª linha
    // ("novo_user_99") "continha" a palavra "user" e era descartada como
    // se fosse um cabeçalho, levando junto a 2ª linha (slice(1) também
    // cortava o 2º @ de verdade).
    const rows = [["novo_user_99"], ["bom.nome.aqui"], ["terceiro.perfil"]];
    expect(resolveApproachUploadRows(rows)).toEqual([
      { username: "novo_user_99", name: null },
      { username: "bom.nome.aqui", name: null },
      { username: "terceiro.perfil", name: null },
    ]);
  });
  it("variações de cabeçalho aceitas: handle / full_name / nome completo", () => {
    const rows = [
      ["handle", "nome completo"],
      ["fulano.ig", "Fulano Silva"],
    ];
    expect(resolveApproachUploadRows(rows)).toEqual([{ username: "fulano.ig", name: "Fulano Silva" }]);
  });
  it("variação de cabeçalho: user_name / full_name (com underscore)", () => {
    const rows = [
      ["user_name", "full_name"],
      ["fulano.ig", "Fulano Silva"],
    ];
    expect(resolveApproachUploadRows(rows)).toEqual([{ username: "fulano.ig", name: "Fulano Silva" }]);
  });
  it("só uma coluna (sem nome) — nome fica null", () => {
    const rows = [["usuario"], ["fulano.ig"], ["ciclana.ig"]];
    expect(resolveApproachUploadRows(rows)).toEqual([
      { username: "fulano.ig", name: null },
      { username: "ciclana.ig", name: null },
    ]);
  });
  it("linha sem @ (célula vazia na coluna de usuário) é descartada", () => {
    const rows = [
      ["usuario", "nome"],
      ["", "Fulano"],
      ["ciclana.ig", "Ciclana"],
    ];
    expect(resolveApproachUploadRows(rows)).toEqual([{ username: "ciclana.ig", name: "Ciclana" }]);
  });
  it("tabela vazia -> []", () => {
    expect(resolveApproachUploadRows([])).toEqual([]);
  });
});

describe("parseApproachUsernamesTxt", () => {
  it("um @ por linha, sem nome", () => {
    expect(parseApproachUsernamesTxt("@fulano.ig\nciclana.ig\n\nbeltrano.ig")).toEqual([
      { username: "@fulano.ig", name: null },
      { username: "ciclana.ig", name: null },
      { username: "beltrano.ig", name: null },
    ]);
  });
});

describe("isWithinApproachHours (7h-20h, São Paulo = UTC-3)", () => {
  it("6h59 em São Paulo (09:59 UTC) — fora", () => {
    expect(isWithinApproachHours(new Date("2026-01-15T09:59:00Z"))).toBe(false);
  });
  it("7h00 em São Paulo (10:00 UTC) — dentro", () => {
    expect(isWithinApproachHours(new Date("2026-01-15T10:00:00Z"))).toBe(true);
  });
  it("19h59 em São Paulo (22:59 UTC) — dentro", () => {
    expect(isWithinApproachHours(new Date("2026-01-15T22:59:00Z"))).toBe(true);
  });
  it("20h00 em São Paulo (23:00 UTC) — fora (janela é [7h,20h), nunca inclui as 20h)", () => {
    expect(isWithinApproachHours(new Date("2026-01-15T23:00:00Z"))).toBe(false);
  });
  it("madrugada (03:00 UTC = meia-noite em São Paulo) — fora", () => {
    expect(isWithinApproachHours(new Date("2026-01-15T03:00:00Z"))).toBe(false);
  });
});

describe("isWithinApproachHours — janela configurável (minutos)", () => {
  it("janela 7h30-19h45: 7h29 fora, 7h30 dentro, 19h44 dentro, 19h45 fora", () => {
    const start = 7 * 60 + 30;
    const end = 19 * 60 + 45;
    expect(isWithinApproachHours(new Date("2026-01-15T10:29:00Z"), start, end)).toBe(false); // 7h29 SP
    expect(isWithinApproachHours(new Date("2026-01-15T10:30:00Z"), start, end)).toBe(true); // 7h30 SP
    expect(isWithinApproachHours(new Date("2026-01-15T22:44:00Z"), start, end)).toBe(true); // 19h44 SP
    expect(isWithinApproachHours(new Date("2026-01-15T22:45:00Z"), start, end)).toBe(false); // 19h45 SP
  });
});

describe("formatApproachWindowLabel", () => {
  it("horas exatas: 'Xh às Yh'", () => {
    expect(formatApproachWindowLabel(7 * 60, 20 * 60)).toBe("7h às 20h");
  });
  it("com minutos: 'Xh30 às Yh45'", () => {
    expect(formatApproachWindowLabel(7 * 60 + 30, 19 * 60 + 45)).toBe("7h30 às 19h45");
  });
});

describe("parseApproachTimeToMinutes / validateApproachWindow", () => {
  it("converte HH:MM em minutos desde a meia-noite", () => {
    expect(parseApproachTimeToMinutes("07:00", "Horário inicial")).toBe(420);
    expect(parseApproachTimeToMinutes("20:30", "Horário final")).toBe(1230);
  });
  it("formato inválido lança erro", () => {
    expect(() => parseApproachTimeToMinutes("25h", "Horário inicial")).toThrow();
    expect(() => parseApproachTimeToMinutes("25:00", "Horário inicial")).toThrow();
  });
  it("início < fim é válido", () => {
    expect(() => validateApproachWindow(420, 1200)).not.toThrow();
  });
  it("início >= fim é inválido", () => {
    expect(() => validateApproachWindow(1200, 420)).toThrow();
    expect(() => validateApproachWindow(600, 600)).toThrow();
  });
});

describe("startOfApproachDay", () => {
  it("meia-noite de São Paulo vira 03:00 UTC do mesmo dia", () => {
    expect(startOfApproachDay(new Date("2026-01-15T14:00:00Z")).toISOString()).toBe("2026-01-15T03:00:00.000Z");
  });
  it("virada do dia: 02:59 UTC (23:59 do dia anterior em São Paulo) ainda conta no dia anterior", () => {
    expect(startOfApproachDay(new Date("2026-01-15T02:59:00Z")).toISOString()).toBe("2026-01-14T03:00:00.000Z");
  });
});

describe("randomApproachWaitMs", () => {
  it("sempre entre 3 e 5 minutos", () => {
    for (let i = 0; i < 200; i++) {
      const ms = randomApproachWaitMs();
      expect(ms).toBeGreaterThanOrEqual(APPROACH_WAIT_MIN_MS);
      expect(ms).toBeLessThanOrEqual(APPROACH_WAIT_MAX_MS);
    }
  });
  it("extremos do rand injetado batem com min/max exatos", () => {
    expect(randomApproachWaitMs(() => 0)).toBe(APPROACH_WAIT_MIN_MS);
    expect(randomApproachWaitMs(() => 0.999999)).toBe(APPROACH_WAIT_MAX_MS);
  });
  it("sorteios independentes não ficam travados num valor fixo", () => {
    const values = new Set(Array.from({ length: 20 }, () => randomApproachWaitMs()));
    expect(values.size).toBeGreaterThan(1);
  });
});

describe("formatApproachCountdown", () => {
  it("m:ss, segundos sempre com 2 dígitos", () => {
    expect(formatApproachCountdown(65_000)).toBe("1:05");
    expect(formatApproachCountdown(3_000)).toBe("0:03");
    expect(formatApproachCountdown(0)).toBe("0:00");
  });
  it("nunca negativo", () => {
    expect(formatApproachCountdown(-5000)).toBe("0:00");
  });
});

describe("resolveAvailableApproachSlots", () => {
  it("só os slots preenchidos, sem fallback (diferente de Reativação)", () => {
    expect(resolveAvailableApproachSlots(["a", null, "c", "", undefined])).toEqual([1, 3]);
    expect(resolveAvailableApproachSlots([null, null, null, null, null])).toEqual([]);
  });
});

describe("pickNextApproachMessageSlot", () => {
  it("nunca repete o lastSlot quando há 2+ disponíveis (sorteando muitas vezes)", () => {
    for (let i = 0; i < 100; i++) {
      const slot = pickNextApproachMessageSlot([1, 2, 3], 2);
      expect(slot).not.toBe(2);
      expect([1, 3]).toContain(slot);
    }
  });
  it("sem lastSlot (1º envio), sorteia entre todos", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 100; i++) seen.add(pickNextApproachMessageSlot([1, 2, 3], null));
    expect(seen.size).toBeGreaterThan(1);
  });
  it("só 1 slot disponível — repete (não há outra opção)", () => {
    expect(pickNextApproachMessageSlot([4], 4)).toBe(4);
  });
  it("sem nenhum slot — erro", () => {
    expect(() => pickNextApproachMessageSlot([], null)).toThrow();
  });
  it("sorteio cobre bem os dois extremos de rand (0 e perto de 1)", () => {
    expect(pickNextApproachMessageSlot([1, 2, 3], 2, () => 0)).toBe(1);
    expect(pickNextApproachMessageSlot([1, 2, 3], 2, () => 0.999999)).toBe(3);
  });
});

describe("fillApproachMessageTemplate", () => {
  it("troca {nome} pelo primeiro nome", () => {
    expect(fillApproachMessageTemplate("Oi {nome}, tudo bem?", "Maria Clara")).toBe("Oi Maria, tudo bem?");
  });
  it("sem nome, o placeholder fica visível", () => {
    expect(fillApproachMessageTemplate("Oi {nome}, tudo bem?", null)).toBe("Oi {nome}, tudo bem?");
  });
  it("troca todas as ocorrências", () => {
    expect(fillApproachMessageTemplate("{nome}? {nome}!", "Ana")).toBe("Ana? Ana!");
  });
});

describe("computeApproachAccountState", () => {
  const INSIDE_HOURS = new Date("2026-01-15T14:00:00Z"); // 11h em São Paulo

  it("fora do horário permitido cobre tudo, mesmo sem pausa/limite/espera", () => {
    const outside = new Date("2026-01-15T03:00:00Z");
    expect(computeApproachAccountState({ now: outside, paused: false, dailyLimit: 60, sentToday: 0, lockedUntil: null })).toEqual({ kind: "OUTSIDE_HOURS" });
  });
  it("pausada", () => {
    expect(computeApproachAccountState({ now: INSIDE_HOURS, paused: true, dailyLimit: 60, sentToday: 0, lockedUntil: null })).toEqual({ kind: "PAUSED" });
  });
  it("limite do dia atingido", () => {
    expect(computeApproachAccountState({ now: INSIDE_HOURS, paused: false, dailyLimit: 10, sentToday: 10, lockedUntil: null })).toEqual({ kind: "LIMIT_REACHED" });
  });
  it("em espera (lockedUntil no futuro) — devolve ms restante", () => {
    const lockedUntil = new Date(INSIDE_HOURS.getTime() + 90_000);
    expect(computeApproachAccountState({ now: INSIDE_HOURS, paused: false, dailyLimit: 60, sentToday: 5, lockedUntil })).toEqual({ kind: "WAITING", msRemaining: 90_000 });
  });
  it("lockedUntil no passado — já liberou, conta como pronta", () => {
    const lockedUntil = new Date(INSIDE_HOURS.getTime() - 1000);
    expect(computeApproachAccountState({ now: INSIDE_HOURS, paused: false, dailyLimit: 60, sentToday: 5, lockedUntil })).toEqual({ kind: "READY" });
  });
  it("liberada (sem nenhuma trava)", () => {
    expect(computeApproachAccountState({ now: INSIDE_HOURS, paused: false, dailyLimit: 60, sentToday: 5, lockedUntil: null })).toEqual({ kind: "READY" });
  });
  it("janela customizada: 11h (INSIDE_HOURS) fica fora se a janela salva for só 13h-18h", () => {
    expect(
      computeApproachAccountState({
        now: INSIDE_HOURS,
        paused: false,
        dailyLimit: 60,
        sentToday: 0,
        lockedUntil: null,
        windowStartMinute: 13 * 60,
        windowEndMinute: 18 * 60,
      })
    ).toEqual({ kind: "OUTSIDE_HOURS" });
  });
});
