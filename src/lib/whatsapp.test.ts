import { describe, it, expect } from "vitest";
import { formatAppointmentConfirmationMessage, normalizeBrazilianWhatsappNumber } from "./whatsapp";

describe("normalizeBrazilianWhatsappNumber", () => {
  it("adiciona o código do país (55) num número local sem ele — bug real: lead digita sem o 55", () => {
    expect(normalizeBrazilianWhatsappNumber("11987654321")).toBe("5511987654321");
  });

  it("adiciona o 55 num número local formatado com parênteses/traço/espaços", () => {
    expect(normalizeBrazilianWhatsappNumber("(11) 98765-4321")).toBe("5511987654321");
  });

  it("adiciona o 55 num número local de telefone fixo (10 dígitos)", () => {
    expect(normalizeBrazilianWhatsappNumber("1132654321")).toBe("551132654321");
  });

  it("não mexe num número que já vem com o 55 (celular, 13 dígitos)", () => {
    expect(normalizeBrazilianWhatsappNumber("5511987654321")).toBe("5511987654321");
  });

  it("não mexe num número que já vem com o 55 (fixo, 12 dígitos)", () => {
    expect(normalizeBrazilianWhatsappNumber("551132654321")).toBe("551132654321");
  });

  it("não mexe num número já com 55, mesmo escrito com '+' e formatação", () => {
    expect(normalizeBrazilianWhatsappNumber("+55 (11) 98765-4321")).toBe("5511987654321");
  });

  it("devolve como veio (só os dígitos) quando o formato não bate com nenhum caso conhecido", () => {
    expect(normalizeBrazilianWhatsappNumber("123")).toBe("123");
  });
});

describe("formatAppointmentConfirmationMessage", () => {
  it("inclui o primeiro nome e a data/horário formatados", () => {
    const message = formatAppointmentConfirmationMessage({
      leadFirstName: "Maria",
      scheduledAt: new Date("2026-09-19T12:00:00.000Z"), // 9h de Brasília
    });

    expect(message).toContain("Oi, Maria!");
    expect(message).toContain("confirmado para");
    expect(message).toContain("9h");
  });

  it("inclui o endereço da clínica quando informado", () => {
    const message = formatAppointmentConfirmationMessage({
      leadFirstName: "João",
      scheduledAt: new Date("2026-09-19T12:00:00.000Z"),
      clinicAddress: "Av. Paulista, 1000",
    });

    expect(message).toContain("📍 Av. Paulista, 1000");
  });

  it("não deixa linha de endereço vazia quando não informado (null, undefined ou string em branco)", () => {
    for (const clinicAddress of [null, undefined, "   "]) {
      const message = formatAppointmentConfirmationMessage({
        leadFirstName: "João",
        scheduledAt: new Date("2026-09-19T12:00:00.000Z"),
        clinicAddress,
      });
      expect(message).not.toContain("📍");
    }
  });
});
