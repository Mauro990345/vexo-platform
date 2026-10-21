import { describe, it, expect } from "vitest";
import {
  parseReportArgs,
  computeReportPeriod,
  leadReportLabel,
  hasRealLeadMessage,
  formatConversationLine,
  formatBrazilDateTime,
  brazilDayKey,
  summarizeByStatus,
  summarizeByDay,
  countDistinctLeads,
  DEFAULT_REPORT_DAYS,
  type ConversationReportRow,
} from "./report-conversations-logic";

function row(overrides: Partial<ConversationReportRow> = {}): ConversationReportRow {
  return {
    conversationId: "conv-1",
    createdAt: new Date("2026-10-15T12:00:00.000Z"),
    leadId: "lead-1",
    leadLabel: "Fulano",
    clinicName: "Clínica Demo",
    status: "IN_CONVERSATION",
    leadMessageCount: 2,
    aiMessageCount: 3,
    ...overrides,
  };
}

describe("parseReportArgs", () => {
  it("sem argumentos: usa o default de dias e nenhum filtro de clínica", () => {
    expect(parseReportArgs([])).toEqual({ days: DEFAULT_REPORT_DAYS, clinic: null });
  });

  it("--days=N define o período", () => {
    expect(parseReportArgs(["--days=7"])).toEqual({ days: 7, clinic: null });
  });

  it("--days inválido (não numérico, zero ou negativo) cai no default", () => {
    expect(parseReportArgs(["--days=abc"]).days).toBe(DEFAULT_REPORT_DAYS);
    expect(parseReportArgs(["--days=0"]).days).toBe(DEFAULT_REPORT_DAYS);
    expect(parseReportArgs(["--days=-5"]).days).toBe(DEFAULT_REPORT_DAYS);
  });

  it("--days com decimal é arredondado pra baixo", () => {
    expect(parseReportArgs(["--days=7.8"]).days).toBe(7);
  });

  it("--clinic=<id ou nome> é lido como string", () => {
    expect(parseReportArgs(["--clinic=Clínica Demo"]).clinic).toBe("Clínica Demo");
  });

  it("os dois juntos, em qualquer ordem", () => {
    expect(parseReportArgs(["--clinic=Demo", "--days=14"])).toEqual({ days: 14, clinic: "Demo" });
    expect(parseReportArgs(["--days=14", "--clinic=Demo"])).toEqual({ days: 14, clinic: "Demo" });
  });

  it("argumento desconhecido é ignorado, sem lançar", () => {
    expect(parseReportArgs(["--apply", "--days=5"])).toEqual({ days: 5, clinic: null });
  });
});

describe("computeReportPeriod", () => {
  it("é sempre now - N dias até now, nunca uma data fixa", () => {
    const now = new Date("2026-10-21T20:00:00.000Z");
    const period = computeReportPeriod(now, 30);
    expect(period.end).toEqual(now);
    expect(period.start.getTime()).toBe(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  });
});

describe("formatBrazilDateTime / brazilDayKey", () => {
  it("converte UTC pra Brasília (-03:00, sem horário de verão)", () => {
    // 2026-10-15T02:30:00Z -> 2026-10-14 23:30 em Brasília
    expect(formatBrazilDateTime(new Date("2026-10-15T02:30:00.000Z"))).toBe("2026-10-14 23:30");
    expect(brazilDayKey(new Date("2026-10-15T02:30:00.000Z"))).toBe("2026-10-14");
  });

  it("uma conversa criada de dia em UTC também cai no dia certo em Brasília", () => {
    expect(formatBrazilDateTime(new Date("2026-10-15T15:05:00.000Z"))).toBe("2026-10-15 12:05");
  });
});

describe("leadReportLabel", () => {
  it("prioriza o nome real", () => {
    expect(leadReportLabel({ name: "Maria Silva", igUsername: "maria.s" })).toBe("Maria Silva");
  });

  it("cai pro @ do Instagram sem nome", () => {
    expect(leadReportLabel({ name: null, igUsername: "maria.s" })).toBe("@maria.s");
  });

  it("rótulo fixo sem nenhum dos dois", () => {
    expect(leadReportLabel({ name: null, igUsername: null })).toBe("(lead sem nome)");
  });
});

describe("hasRealLeadMessage", () => {
  it("true com pelo menos 1 mensagem do lead", () => {
    expect(hasRealLeadMessage({ leadMessageCount: 1 })).toBe(true);
  });

  it("false sem nenhuma mensagem do lead — só automático", () => {
    expect(hasRealLeadMessage({ leadMessageCount: 0 })).toBe(false);
  });
});

describe("formatConversationLine", () => {
  it("inclui data/hora BRT, lead, clínica, status, contagens e a marcação de engajamento", () => {
    const line = formatConversationLine(row());
    expect(line).toContain("Fulano");
    expect(line).toContain("Clínica Demo");
    expect(line).toContain("IN_CONVERSATION");
    expect(line).toContain("lead=2");
    expect(line).toContain("ia=3");
    expect(line).toContain("respondeu");
  });

  it("marca SÓ AUTOMÁTICO quando o lead nunca respondeu", () => {
    const line = formatConversationLine(row({ leadMessageCount: 0, aiMessageCount: 1 }));
    expect(line).toContain("SÓ AUTOMÁTICO");
  });
});

describe("summarizeByStatus", () => {
  it("agrupa e ordena na ordem fixa do Pipeline, só com status que apareceram", () => {
    const rows = [
      row({ conversationId: "a", status: "LOST" }),
      row({ conversationId: "b", status: "NEW" }),
      row({ conversationId: "c", status: "NEW" }),
      row({ conversationId: "d", status: "SCHEDULED" }),
    ];
    expect(summarizeByStatus(rows)).toEqual([
      { status: "NEW", count: 2 },
      { status: "SCHEDULED", count: 1 },
      { status: "LOST", count: 1 },
    ]);
  });

  it("lista vazia: devolve array vazio", () => {
    expect(summarizeByStatus([])).toEqual([]);
  });
});

describe("summarizeByDay", () => {
  it("agrupa por dia em Brasília, incluindo dias sem nenhuma conversa dentro do período", () => {
    const period = { start: new Date("2026-10-13T03:00:00.000Z"), end: new Date("2026-10-15T20:00:00.000Z") };
    const rows = [
      row({ conversationId: "a", createdAt: new Date("2026-10-13T12:00:00.000Z") }), // 2026-10-13 BRT
      row({ conversationId: "b", createdAt: new Date("2026-10-13T23:50:00.000Z") }), // ainda 2026-10-13 BRT (20:50)
      row({ conversationId: "c", createdAt: new Date("2026-10-15T14:00:00.000Z") }), // 2026-10-15 BRT
    ];
    expect(summarizeByDay(rows, period)).toEqual([
      { day: "2026-10-13", count: 2 },
      { day: "2026-10-14", count: 0 },
      { day: "2026-10-15", count: 1 },
    ]);
  });
});

describe("countDistinctLeads", () => {
  it("conta leads únicos, não conversas", () => {
    const rows = [
      row({ conversationId: "a", leadId: "lead-1" }),
      row({ conversationId: "b", leadId: "lead-1" }),
      row({ conversationId: "c", leadId: "lead-2" }),
    ];
    expect(countDistinctLeads(rows)).toBe(2);
  });

  it("lista vazia: devolve 0", () => {
    expect(countDistinctLeads([])).toBe(0);
  });
});
