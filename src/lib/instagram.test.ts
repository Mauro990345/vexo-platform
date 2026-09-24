import { describe, it, expect } from "vitest";
import { isRealIgScopedId } from "@/lib/instagram";

// Bug real: prisma/seed-demo.ts cria 40 leads de demonstração com igScopedId
// tipo "demo-new-0" (nunca um IGSID de verdade da Meta, que é sempre uma
// string só de dígitos) — chamar a Conversations API com esse valor sempre
// falhava com "(#100) Param user_id must be a numeric string", e como esse
// erro era tratado como transitório (nunca marcava a tentativa como
// definitiva), esses 40 leads de demo ocupavam pra sempre o lote inteiro do
// backfill de foto de perfil, bloqueando leads reais de serem tentados.
describe("isRealIgScopedId", () => {
  it("aceita um IGSID real (string só de dígitos)", () => {
    expect(isRealIgScopedId("17841400000000000")).toBe(true);
  });

  it("rejeita os igScopedId de leads de seed/demo (prisma/seed-demo.ts)", () => {
    expect(isRealIgScopedId("demo-new-0")).toBe(false);
    expect(isRealIgScopedId("demo-conversa-3")).toBe(false);
    expect(isRealIgScopedId("demo-agendado-7")).toBe(false);
    expect(isRealIgScopedId("demo-followup-1")).toBe(false);
    expect(isRealIgScopedId("demo-perdido-2")).toBe(false);
  });

  it("rejeita string vazia e qualquer valor não puramente numérico", () => {
    expect(isRealIgScopedId("")).toBe(false);
    expect(isRealIgScopedId("123abc")).toBe(false);
    expect(isRealIgScopedId("12.3")).toBe(false);
    expect(isRealIgScopedId("-123")).toBe(false);
  });
});
