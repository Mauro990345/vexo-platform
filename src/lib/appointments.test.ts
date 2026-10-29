import { describe, it, expect, vi, beforeEach } from "vitest";

const appointmentFindUniqueMock = vi.fn();
const appointmentUpdateMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    appointment: {
      findUnique: (...args: unknown[]) => appointmentFindUniqueMock(...args),
      update: (...args: unknown[]) => appointmentUpdateMock(...args),
    },
  },
}));

import { setAppointmentReturnPeriod } from "./appointments";

// Botão "Retorno" (ver RetornoButton.tsx) — só testa setAppointmentReturnPeriod
// aqui (setAppointmentAttendance já existia antes desta tarefa e não foi
// alterado; sem teste próprio, fora de escopo).
describe("setAppointmentReturnPeriod", () => {
  beforeEach(() => {
    appointmentFindUniqueMock.mockReset();
    appointmentUpdateMock.mockReset();
  });

  it("agendamento inexistente: not_found, sem gravar nada", async () => {
    appointmentFindUniqueMock.mockResolvedValue(null);

    const result = await setAppointmentReturnPeriod("appt-inexistente", 120);

    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(appointmentUpdateMock).not.toHaveBeenCalled();
  });

  it("marca um prazo (dias): grava o número, returnPeriodNone false", async () => {
    appointmentFindUniqueMock.mockResolvedValue({ id: "appt-1", reactivationCardSlots: [] });
    appointmentUpdateMock.mockResolvedValue({ id: "appt-1", returnPeriodDays: 120, returnPeriodNone: false });

    const result = await setAppointmentReturnPeriod("appt-1", 120);

    expect(result).toEqual({ ok: true, appointmentId: "appt-1", returnPeriodDays: 120, returnPeriodNone: false });
    expect(appointmentUpdateMock).toHaveBeenCalledWith({
      where: { id: "appt-1" },
      data: { returnPeriodDays: 120, returnPeriodNone: false },
      select: { id: true, returnPeriodDays: true, returnPeriodNone: true },
    });
  });

  it('marca "Sem retorno": returnPeriodDays null, returnPeriodNone true', async () => {
    appointmentFindUniqueMock.mockResolvedValue({ id: "appt-1", reactivationCardSlots: [] });
    appointmentUpdateMock.mockResolvedValue({ id: "appt-1", returnPeriodDays: null, returnPeriodNone: true });

    const result = await setAppointmentReturnPeriod("appt-1", "none");

    expect(result).toEqual({ ok: true, appointmentId: "appt-1", returnPeriodDays: null, returnPeriodNone: true });
    expect(appointmentUpdateMock).toHaveBeenCalledWith({
      where: { id: "appt-1" },
      data: { returnPeriodDays: null, returnPeriodNone: true },
      select: { id: true, returnPeriodDays: true, returnPeriodNone: true },
    });
  });

  it("marcar um prazo depois de outro: substitui (não acumula), mesmo padrão de sempre", async () => {
    appointmentFindUniqueMock.mockResolvedValue({ id: "appt-1", reactivationCardSlots: [] });
    appointmentUpdateMock.mockResolvedValue({ id: "appt-1", returnPeriodDays: 60, returnPeriodNone: false });

    const result = await setAppointmentReturnPeriod("appt-1", 60);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.returnPeriodDays).toBe(60);
  });

  it("já enviado (qualquer ReactivationCardSlot com sentAt): trava — already_sent, sem gravar", async () => {
    appointmentFindUniqueMock.mockResolvedValue({ id: "appt-1", reactivationCardSlots: [{ id: "slot-1" }] });

    const result = await setAppointmentReturnPeriod("appt-1", 90);

    expect(result).toEqual({ ok: false, reason: "already_sent" });
    expect(appointmentUpdateMock).not.toHaveBeenCalled();
  });

  it('desmarca via "unset": volta ao padrão (returnPeriodDays null, returnPeriodNone false)', async () => {
    appointmentFindUniqueMock.mockResolvedValue({ id: "appt-1", reactivationCardSlots: [] });
    appointmentUpdateMock.mockResolvedValue({ id: "appt-1", returnPeriodDays: null, returnPeriodNone: false });

    const result = await setAppointmentReturnPeriod("appt-1", "unset");

    expect(result).toEqual({ ok: true, appointmentId: "appt-1", returnPeriodDays: null, returnPeriodNone: false });
    expect(appointmentUpdateMock).toHaveBeenCalledWith({
      where: { id: "appt-1" },
      data: { returnPeriodDays: null, returnPeriodNone: false },
      select: { id: true, returnPeriodDays: true, returnPeriodNone: true },
    });
  });

  it('já enviado: "unset" também trava — already_sent, sem gravar (mesma regra que marcar um prazo)', async () => {
    appointmentFindUniqueMock.mockResolvedValue({ id: "appt-1", reactivationCardSlots: [{ id: "slot-1" }] });

    const result = await setAppointmentReturnPeriod("appt-1", "unset");

    expect(result).toEqual({ ok: false, reason: "already_sent" });
    expect(appointmentUpdateMock).not.toHaveBeenCalled();
  });
});
