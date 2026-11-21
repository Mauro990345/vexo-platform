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
  formatApproachPauseCountdown,
  validateApproachTiming,
  DEFAULT_APPROACH_WAIT_MIN_MINUTES,
  DEFAULT_APPROACH_WAIT_MAX_MINUTES,
  resolveAvailableApproachSlots,
  pickNextApproachMessageSlot,
  fillApproachMessageTemplate,
  computeApproachAccountState,
  approachAccountSortKey,
  formatApproachDaysRemainingLabel,
  approachQueueLevel,
  estimateQueuedItemsMsRemaining,
  formatApproachEstimateLabel,
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
  it("padrão (1-2min): sempre dentro do intervalo", () => {
    for (let i = 0; i < 200; i++) {
      const ms = randomApproachWaitMs();
      expect(ms).toBeGreaterThanOrEqual(DEFAULT_APPROACH_WAIT_MIN_MINUTES * 60_000);
      expect(ms).toBeLessThanOrEqual(DEFAULT_APPROACH_WAIT_MAX_MINUTES * 60_000);
    }
  });
  it("extremos do rand injetado batem com min/max exatos (padrão)", () => {
    expect(randomApproachWaitMs(DEFAULT_APPROACH_WAIT_MIN_MINUTES, DEFAULT_APPROACH_WAIT_MAX_MINUTES, () => 0)).toBe(60_000);
    expect(randomApproachWaitMs(DEFAULT_APPROACH_WAIT_MIN_MINUTES, DEFAULT_APPROACH_WAIT_MAX_MINUTES, () => 0.999999)).toBe(120_000);
  });
  it("intervalo configurado (ex.: 5-10min) é respeitado, nunca o padrão", () => {
    for (let i = 0; i < 100; i++) {
      const ms = randomApproachWaitMs(5, 10);
      expect(ms).toBeGreaterThanOrEqual(5 * 60_000);
      expect(ms).toBeLessThanOrEqual(10 * 60_000);
    }
  });
  it("sorteios independentes não ficam travados num valor fixo", () => {
    const values = new Set(Array.from({ length: 20 }, () => randomApproachWaitMs()));
    expect(values.size).toBeGreaterThan(1);
  });
});

describe("validateApproachTiming", () => {
  const valid = { waitMinMinutes: 1, waitMaxMinutes: 2, batchSize: 30, batchPauseHours: 2 };
  it("valores padrão são válidos", () => {
    expect(() => validateApproachTiming(valid)).not.toThrow();
  });
  it("mínimo > máximo é inválido", () => {
    expect(() => validateApproachTiming({ ...valid, waitMinMinutes: 5, waitMaxMinutes: 2 })).toThrow();
  });
  it("mínimo < 1 minuto é inválido", () => {
    expect(() => validateApproachTiming({ ...valid, waitMinMinutes: 0 })).toThrow();
  });
  it("envios por lote < 1 é inválido", () => {
    expect(() => validateApproachTiming({ ...valid, batchSize: 0 })).toThrow();
  });
  it("pausa negativa é inválida; pausa 0 (sem pausa) é válida", () => {
    expect(() => validateApproachTiming({ ...valid, batchPauseHours: -1 })).toThrow();
    expect(() => validateApproachTiming({ ...valid, batchPauseHours: 0 })).not.toThrow();
  });
  it("campo não numérico (ex.: NaN de um formulário vazio) é inválido", () => {
    expect(() => validateApproachTiming({ ...valid, waitMinMinutes: NaN })).toThrow();
  });
});

describe("formatApproachDaysRemainingLabel", () => {
  it("fila vazia", () => {
    expect(formatApproachDaysRemainingLabel(0, 60)).toBe("Fila vazia");
  });
  it("mais de 3 dias — arredonda pra inteiro, plural 'dias'", () => {
    expect(formatApproachDaysRemainingLabel(320, 60)).toBe("uns 5 dias"); // 5,33 -> 5
    expect(formatApproachDaysRemainingLabel(241, 60)).toBe("uns 4 dias"); // 4,01... arredonda pra 4
  });
  it("entre 1 e 3 dias (inclusive) — 1 casa decimal, vírgula, singular 'dia'", () => {
    expect(formatApproachDaysRemainingLabel(90, 60)).toBe("uns 1,5 dia");
    expect(formatApproachDaysRemainingLabel(180, 60)).toBe("uns 3,0 dia");
    expect(formatApproachDaysRemainingLabel(60, 60)).toBe("uns 1,0 dia");
  });
  it("menos de 1 dia (mas fila não vazia)", () => {
    expect(formatApproachDaysRemainingLabel(30, 60)).toBe("menos de 1 dia");
  });
});

describe("approachQueueLevel", () => {
  it("fila vazia -> perigo", () => {
    expect(approachQueueLevel(0, 60)).toBe("danger");
  });
  it("menos de 1 dia -> perigo", () => {
    expect(approachQueueLevel(30, 60)).toBe("danger");
  });
  it("entre 1 e 2 dias (exclusive) -> aviso", () => {
    expect(approachQueueLevel(60, 60)).toBe("warning"); // exatamente 1 dia
    expect(approachQueueLevel(90, 60)).toBe("warning"); // 1,5 dia
  });
  it("2 dias ou mais -> normal", () => {
    expect(approachQueueLevel(120, 60)).toBe("normal"); // exatamente 2 dias
    expect(approachQueueLevel(320, 60)).toBe("normal");
  });
});

describe("formatApproachPauseCountdown", () => {
  it("H:MM:SS, com horas sem zero à esquerda", () => {
    expect(formatApproachPauseCountdown(2 * 3600_000)).toBe("2:00:00");
    expect(formatApproachPauseCountdown(1 * 3600_000 + 48 * 60_000)).toBe("1:48:00");
    expect(formatApproachPauseCountdown(65_000)).toBe("0:01:05");
    expect(formatApproachPauseCountdown(0)).toBe("0:00:00");
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
  const base = { paused: false, dailyLimit: 60, sentToday: 0, lockedUntil: null, batchPausedUntil: null };

  it("fora do horário permitido cobre tudo, mesmo sem pausa/limite/espera", () => {
    const outside = new Date("2026-01-15T03:00:00Z");
    expect(computeApproachAccountState({ ...base, now: outside })).toEqual({ kind: "OUTSIDE_HOURS" });
  });
  it("pausada manualmente", () => {
    expect(computeApproachAccountState({ ...base, now: INSIDE_HOURS, paused: true })).toEqual({ kind: "PAUSED" });
  });
  it("limite do dia atingido", () => {
    expect(computeApproachAccountState({ ...base, now: INSIDE_HOURS, dailyLimit: 10, sentToday: 10 })).toEqual({ kind: "LIMIT_REACHED" });
  });
  it("pausa de lote (batchPausedUntil no futuro) — devolve ms restante", () => {
    const batchPausedUntil = new Date(INSIDE_HOURS.getTime() + 2 * 3600_000);
    expect(computeApproachAccountState({ ...base, now: INSIDE_HOURS, batchPausedUntil })).toEqual({ kind: "BATCH_PAUSED", msRemaining: 2 * 3600_000 });
  });
  it("pausa de lote vencida (passado) — não bloqueia, cai pro próximo gate", () => {
    const batchPausedUntil = new Date(INSIDE_HOURS.getTime() - 1000);
    expect(computeApproachAccountState({ ...base, now: INSIDE_HOURS, batchPausedUntil })).toEqual({ kind: "READY" });
  });
  it("pausa de lote tem prioridade sobre a espera comum (as duas podem estar ativas ao mesmo tempo)", () => {
    const batchPausedUntil = new Date(INSIDE_HOURS.getTime() + 2 * 3600_000);
    const lockedUntil = new Date(INSIDE_HOURS.getTime() + 90_000);
    expect(computeApproachAccountState({ ...base, now: INSIDE_HOURS, batchPausedUntil, lockedUntil })).toEqual({ kind: "BATCH_PAUSED", msRemaining: 2 * 3600_000 });
  });
  it("limite do dia continua valendo por cima mesmo com a pausa de lote já vencida", () => {
    const batchPausedUntil = new Date(INSIDE_HOURS.getTime() - 1000);
    expect(computeApproachAccountState({ ...base, now: INSIDE_HOURS, dailyLimit: 10, sentToday: 10, batchPausedUntil })).toEqual({ kind: "LIMIT_REACHED" });
  });
  it("em espera (lockedUntil no futuro) — devolve ms restante", () => {
    const lockedUntil = new Date(INSIDE_HOURS.getTime() + 90_000);
    expect(computeApproachAccountState({ ...base, now: INSIDE_HOURS, sentToday: 5, lockedUntil })).toEqual({ kind: "WAITING", msRemaining: 90_000 });
  });
  it("lockedUntil no passado — já liberou, conta como pronta", () => {
    const lockedUntil = new Date(INSIDE_HOURS.getTime() - 1000);
    expect(computeApproachAccountState({ ...base, now: INSIDE_HOURS, sentToday: 5, lockedUntil })).toEqual({ kind: "READY" });
  });
  it("liberada (sem nenhuma trava)", () => {
    expect(computeApproachAccountState({ ...base, now: INSIDE_HOURS, sentToday: 5 })).toEqual({ kind: "READY" });
  });
  it("janela customizada: 11h (INSIDE_HOURS) fica fora se a janela salva for só 13h-18h", () => {
    expect(
      computeApproachAccountState({ ...base, now: INSIDE_HOURS, windowStartMinute: 13 * 60, windowEndMinute: 18 * 60 })
    ).toEqual({ kind: "OUTSIDE_HOURS" });
  });
  it("fora do horário cobre até uma pausa de lote já vencida (\"se a pausa terminar fora do horário, continua bloqueada\")", () => {
    const outside = new Date("2026-01-15T03:00:00Z");
    const batchPausedUntil = new Date(outside.getTime() - 1000);
    expect(computeApproachAccountState({ ...base, now: outside, batchPausedUntil })).toEqual({ kind: "OUTSIDE_HOURS" });
  });
});

// Fila por clínica (/crm/clinicas/[id]/abordagem/fila) — estimativa
// PURAMENTE VISUAL de quando os itens empilhados atrás do ativo devem
// liberar (nunca decide se o botão é clicável, ver ClinicFilaView.tsx).
describe("estimateQueuedItemsMsRemaining", () => {
  const NO_BATCH_PAUSE = { batchSentCount: 0, batchSize: 30, batchPauseMs: 0, waitMinMs: 60_000, waitMaxMs: 120_000 };

  it("item 0 (ativo): sempre o frontMsRemaining exato, sem nenhum acréscimo", () => {
    const result = estimateQueuedItemsMsRemaining({ frontMsRemaining: 45_000, itemCount: 3, ...NO_BATCH_PAUSE });
    expect(result[0]).toBe(45_000);
  });

  it("itens seguintes somam a espera MÉDIA configurada (waitMin+waitMax)/2, item a item", () => {
    const result = estimateQueuedItemsMsRemaining({ frontMsRemaining: 0, itemCount: 4, ...NO_BATCH_PAUSE });
    const avgWaitMs = (60_000 + 120_000) / 2; // 90_000
    expect(result).toEqual([0, avgWaitMs, avgWaitMs * 2, avgWaitMs * 3]);
  });

  it("front já com espera real (WAITING): os itens de baixo somam a média EM CIMA do tempo real do ativo", () => {
    const result = estimateQueuedItemsMsRemaining({ frontMsRemaining: 20_000, itemCount: 2, ...NO_BATCH_PAUSE });
    expect(result).toEqual([20_000, 20_000 + 90_000]);
  });

  it("cruza a fronteira do lote: soma a pausa inteira quando o envio hipotético fecha o lote (nextBatchSentCount >= batchSize)", () => {
    // batchSentCount=29, batchSize=30 — o 1º item hipotético (índice 1) fecha o lote.
    const result = estimateQueuedItemsMsRemaining({
      frontMsRemaining: 0,
      itemCount: 3,
      batchSentCount: 29,
      batchSize: 30,
      batchPauseMs: 2 * 3600_000,
      waitMinMs: 60_000,
      waitMaxMs: 120_000,
    });
    const avgWaitMs = 90_000;
    expect(result[0]).toBe(0);
    expect(result[1]).toBe(avgWaitMs + 2 * 3600_000); // fechou o lote — soma a pausa inteira
    // depois da pausa, o contador do lote reinicia — o 2º item hipotético não cruza outra fronteira.
    expect(result[2]).toBe(avgWaitMs * 2 + 2 * 3600_000);
  });

  it("pausa de lote DESLIGADA (batchPauseMs=0): nunca soma pausa, mesmo cruzando o tamanho do lote", () => {
    const result = estimateQueuedItemsMsRemaining({
      frontMsRemaining: 0,
      itemCount: 3,
      batchSentCount: 29,
      batchSize: 30,
      batchPauseMs: 0,
      waitMinMs: 60_000,
      waitMaxMs: 120_000,
    });
    expect(result).toEqual([0, 90_000, 180_000]);
  });

  it("itemCount=1 (só o ativo): devolve só [frontMsRemaining], sem calcular mais nada", () => {
    expect(estimateQueuedItemsMsRemaining({ frontMsRemaining: 5_000, itemCount: 1, ...NO_BATCH_PAUSE })).toEqual([5_000]);
  });
});

describe("formatApproachEstimateLabel", () => {
  it("minutos e segundos — exemplo do pedido: '1min 20s'", () => {
    expect(formatApproachEstimateLabel(80_000)).toBe("1min 20s");
  });

  it("só segundos (abaixo de 1 minuto)", () => {
    expect(formatApproachEstimateLabel(45_000)).toBe("45s");
  });

  it("minutos exatos, sem segundos sobrando", () => {
    expect(formatApproachEstimateLabel(3 * 60_000)).toBe("3min 00s");
  });

  it("acima de 1 hora — formato próprio, nunca 'NNNmin'", () => {
    expect(formatApproachEstimateLabel(2 * 3600_000 + 5 * 60_000)).toBe("2h05min");
  });

  it("zero ou negativo — nunca negativo, cai pra '0s'", () => {
    expect(formatApproachEstimateLabel(0)).toBe("0s");
    expect(formatApproachEstimateLabel(-500)).toBe("0s");
  });
});

describe("approachAccountSortKey", () => {
  it("READY sempre primeiro (chave negativa)", () => {
    expect(approachAccountSortKey({ kind: "READY" })).toBeLessThan(0);
  });
  it("espera curta (1min) vem antes de pausa de lote longa (2h), sem tratamento especial", () => {
    const waiting = approachAccountSortKey({ kind: "WAITING", msRemaining: 60_000 });
    const batchPaused = approachAccountSortKey({ kind: "BATCH_PAUSED", msRemaining: 2 * 3600_000 });
    expect(waiting).toBeLessThan(batchPaused);
  });
  it("WAITING/BATCH_PAUSED ordenam pelo próprio ms restante (quem volta mais cedo primeiro)", () => {
    const soon = approachAccountSortKey({ kind: "WAITING", msRemaining: 10_000 });
    const later = approachAccountSortKey({ kind: "WAITING", msRemaining: 50_000 });
    expect(soon).toBeLessThan(later);
  });
  it("LIMIT_REACHED/OUTSIDE_HOURS/PAUSED vêm depois de qualquer espera/pausa de lote", () => {
    const batchPaused = approachAccountSortKey({ kind: "BATCH_PAUSED", msRemaining: 5 * 3600_000 }); // pausa bem longa
    expect(approachAccountSortKey({ kind: "LIMIT_REACHED" })).toBeGreaterThan(batchPaused);
    expect(approachAccountSortKey({ kind: "OUTSIDE_HOURS" })).toBeGreaterThan(batchPaused);
    expect(approachAccountSortKey({ kind: "PAUSED" })).toBeGreaterThan(batchPaused);
  });
  it("PAUSED manual é sempre o último (nunca volta sozinho)", () => {
    expect(approachAccountSortKey({ kind: "PAUSED" })).toBeGreaterThan(approachAccountSortKey({ kind: "LIMIT_REACHED" }));
    expect(approachAccountSortKey({ kind: "PAUSED" })).toBeGreaterThan(approachAccountSortKey({ kind: "OUTSIDE_HOURS" }));
  });
});
