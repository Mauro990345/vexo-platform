import { describe, it, expect } from "vitest";
import { leadDisplayLabel } from "@/lib/lead-display";

describe("leadDisplayLabel", () => {
  it("mostra @handle (Nome) quando o lead tem os dois — formato exato pedido", () => {
    expect(leadDisplayLabel({ name: "Leonardo da Silva", igUsername: "profissao_volante" }, null)).toBe(
      "@profissao_volante (Leonardo da Silva)"
    );
    expect(leadDisplayLabel({ name: "Mauro", igUsername: "rico.insulfilm" }, null)).toBe("@rico.insulfilm (Mauro)");
  });

  it("mostra só @handle quando o lead tem username mas ainda não tem nome capturado", () => {
    expect(leadDisplayLabel({ name: null, igUsername: "profissao_volante" }, null)).toBe("@profissao_volante");
  });

  it("cai pro nome sozinho quando o lead não tem igUsername salvo — bug real: a maioria dos leads existentes ainda não passou pelo backfill/lookup, então isso é o caso comum, não a exceção", () => {
    expect(leadDisplayLabel({ name: "Leonardo da Silva", igUsername: null }, null)).toBe("Leonardo da Silva");
  });

  it('cai pra "Lead" quando não tem nem nome nem username', () => {
    expect(leadDisplayLabel({ name: null, igUsername: null }, null)).toBe("Lead");
  });

  it("usa manualTitle (ou o fallback 'Agendamento') pra agendamento sem lead vinculado (importado do Google Calendar)", () => {
    expect(leadDisplayLabel(null, "Avaliação Dra. Ana")).toBe("Avaliação Dra. Ana");
    expect(leadDisplayLabel(null, null)).toBe("Agendamento");
  });
});
