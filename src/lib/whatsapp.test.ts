import { describe, it, expect } from "vitest";
import { formatAppointmentConfirmationMessage } from "./whatsapp";

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
