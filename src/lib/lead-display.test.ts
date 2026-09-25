import { describe, it, expect } from "vitest";
import { leadDisplayParts } from "@/lib/lead-display";

describe("leadDisplayParts", () => {
  it("nome como primary e @handle como secundário quando o lead tem os dois — formato atual (nome em destaque, @ discreto ao lado)", () => {
    expect(leadDisplayParts({ name: "Leonardo da Silva", igUsername: "profissao_volante" }, null)).toEqual({
      primary: "Leonardo da Silva",
      handle: "profissao_volante",
    });
    expect(leadDisplayParts({ name: "Mauro", igUsername: "rico.insulfilm" }, null)).toEqual({
      primary: "Mauro",
      handle: "rico.insulfilm",
    });
  });

  it("mostra só o @handle como primary (sem secundário) quando o lead tem username mas ainda não tem nome capturado", () => {
    expect(leadDisplayParts({ name: null, igUsername: "profissao_volante" }, null)).toEqual({
      primary: "profissao_volante",
      handle: null,
    });
  });

  it("cai pro nome sozinho (sem secundário) quando o lead não tem igUsername salvo — bug real: a maioria dos leads existentes ainda não passou pelo backfill/lookup, então isso é o caso comum, não a exceção", () => {
    expect(leadDisplayParts({ name: "Leonardo da Silva", igUsername: null }, null)).toEqual({
      primary: "Leonardo da Silva",
      handle: null,
    });
  });

  it('cai pra "Lead" quando não tem nem nome nem username', () => {
    expect(leadDisplayParts({ name: null, igUsername: null }, null)).toEqual({ primary: "Lead", handle: null });
  });

  it("usa manualTitle (ou o fallback 'Agendamento') pra agendamento sem lead vinculado (importado do Google Calendar)", () => {
    expect(leadDisplayParts(null, "Avaliação Dra. Ana")).toEqual({ primary: "Avaliação Dra. Ana", handle: null });
    expect(leadDisplayParts(null, null)).toEqual({ primary: "Agendamento", handle: null });
  });
});
