import { describe, it, expect } from "vitest";
import {
  formatAppointmentConfirmationMessage,
  normalizeBrazilianWhatsappNumber,
  validateBrazilianPhone,
  formatBrazilianPhoneForDisplay,
} from "./whatsapp";

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

  // Ajuste: Lead.phone agora é salvo SEM o 55 (ver describe "localDigits"
  // mais abaixo) — este é o teste que prova que o envio de verdade
  // (sendWhatsappMessage, usado por confirmação de agendamento e pelos 3
  // passos de follow-up) continua funcionando: ele chama
  // normalizeBrazilianWhatsappNumber no telefone exatamente como está
  // salvo, que acrescenta o 55 aqui, só neste ponto, antes de mandar pra
  // Evolution API.
  it('telefone salvo como Lead.phone hoje ("21998223038", sem 55) ganha o 55 só na hora de enviar', () => {
    expect(normalizeBrazilianWhatsappNumber("21998223038")).toBe("5521998223038");
  });
});

// Bug real reportado: "998223038" (9 dígitos, sem DDD) era salvo direto em
// Lead.phone e na descrição do evento do Google Calendar — a normalização
// antiga só sabia ADICIONAR o 55 quando o número já tinha DDD (10/11
// dígitos); qualquer outro tamanho caía num fallback que devolvia o
// número como veio, sem avisar que faltava o DDD. DDD passa a ser sempre
// obrigatório — ver saveLeadPhone, conversation-pipeline.ts.
describe("validateBrazilianPhone", () => {
  it('"998223038" (9 dígitos, sem DDD) -> inválido', () => {
    const result = validateBrazilianPhone("998223038");
    expect(result.valid).toBe(false);
  });

  it('"98223038" (8 dígitos, sem DDD) -> inválido', () => {
    const result = validateBrazilianPhone("98223038");
    expect(result.valid).toBe(false);
  });

  it('"21998223038" (11 dígitos, DDD + celular) -> válido', () => {
    const result = validateBrazilianPhone("21998223038");
    expect(result).toEqual({ valid: true, localDigits: "21998223038", e164: "5521998223038" });
  });

  it('"(21) 99822-3038" (formatado, com DDD) -> válido', () => {
    const result = validateBrazilianPhone("(21) 99822-3038");
    expect(result).toEqual({ valid: true, localDigits: "21998223038", e164: "5521998223038" });
  });

  it('"+55 21 99822-3038" (com código do país e formatação) -> válido', () => {
    const result = validateBrazilianPhone("+55 21 99822-3038");
    expect(result).toEqual({ valid: true, localDigits: "21998223038", e164: "5521998223038" });
  });

  it('"2198223038" (10 dígitos, DDD + fixo) -> válido', () => {
    const result = validateBrazilianPhone("2198223038");
    expect(result).toEqual({ valid: true, localDigits: "2198223038", e164: "552198223038" });
  });

  it('"021998223038" (0 inicial + DDD, erro comum de digitação) -> válido, 0 removido', () => {
    const result = validateBrazilianPhone("021998223038");
    expect(result).toEqual({ valid: true, localDigits: "21998223038", e164: "5521998223038" });
  });

  it('"55998223038" (11 dígitos — "55" aqui é o DDD de Rio/Niterói, não o código do país) -> válido', () => {
    const result = validateBrazilianPhone("55998223038");
    expect(result).toEqual({ valid: true, localDigits: "55998223038", e164: "5555998223038" });
  });

  it("mensagem de erro cita DDD, pra IA pedir o número completo", () => {
    const result = validateBrazilianPhone("998223038");
    expect(result.valid).toBe(false);
    expect((result as { valid: false; reason: string }).reason).toContain("DDD");
  });
});

// Ajuste: Lead.phone passa a salvar localDigits (DDD + número, SEM o 55),
// não mais e164 — saveLeadPhone (conversation-pipeline.ts) usa
// validateBrazilianPhone(...).localDigits, nunca .e164. O 55 só entra na
// hora de ENVIAR de verdade (ver normalizeBrazilianWhatsappNumber, chamada
// por sendWhatsappMessage) — nunca no valor persistido. Estes testes
// isolam exatamente esse contrato (o campo que vira o valor salvo), com
// os mesmos casos de validateBrazilianPhone acima.
describe("localDigits — valor que agora é salvo em Lead.phone (sem o 55)", () => {
  it('"21998223038" -> salva "21998223038" (antes salvava "5521998223038")', () => {
    const result = validateBrazilianPhone("21998223038");
    expect(result.valid && result.localDigits).toBe("21998223038");
  });

  it('"+55 21 99822-3038" -> salva "21998223038" (55 do país removido, nunca salvo)', () => {
    const result = validateBrazilianPhone("+55 21 99822-3038");
    expect(result.valid && result.localDigits).toBe("21998223038");
  });

  it('"2198223038" (10 dígitos) -> salva "2198223038"', () => {
    const result = validateBrazilianPhone("2198223038");
    expect(result.valid && result.localDigits).toBe("2198223038");
  });

  it('"55998223038" (DDD 55, 11 dígitos) -> salva "55998223038" (o 55 aqui é DDD, não código do país — nunca removido)', () => {
    const result = validateBrazilianPhone("55998223038");
    expect(result.valid && result.localDigits).toBe("55998223038");
  });

  it('"998223038" (sem DDD) -> continua inválido, nada é salvo', () => {
    const result = validateBrazilianPhone("998223038");
    expect(result.valid).toBe(false);
  });
});

describe("formatBrazilianPhoneForDisplay", () => {
  it("celular (E.164, 13 dígitos) -> (DD) 9XXXX-XXXX", () => {
    expect(formatBrazilianPhoneForDisplay("5521998223038")).toBe("(21) 99822-3038");
  });

  it("fixo (E.164, 12 dígitos) -> (DD) XXXX-XXXX", () => {
    expect(formatBrazilianPhoneForDisplay("551132654321")).toBe("(11) 3265-4321");
  });

  it("formato inesperado devolve como veio, sem adivinhar", () => {
    expect(formatBrazilianPhoneForDisplay("123")).toBe("123");
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

  // Regra de produto: o WhatsApp da clínica serve SÓ pra esta confirmação
  // — nenhum link (wa.me do pedido de humano, ou qualquer outro) pode
  // vazar pra dentro dela. Trava explícita contra isso, com e sem
  // endereço (que também não deve nunca virar um link).
  it("nunca contém link nenhum (http ou wa.me) — nem com endereço, nem sem", () => {
    const withAddress = formatAppointmentConfirmationMessage({
      leadFirstName: "Maria",
      scheduledAt: new Date("2026-09-19T12:00:00.000Z"),
      clinicAddress: "Av. Paulista, 1000",
    });
    const withoutAddress = formatAppointmentConfirmationMessage({
      leadFirstName: "Maria",
      scheduledAt: new Date("2026-09-19T12:00:00.000Z"),
    });

    for (const message of [withAddress, withoutAddress]) {
      expect(message.toLowerCase()).not.toContain("http");
      expect(message.toLowerCase()).not.toContain("wa.me");
    }
  });
});
