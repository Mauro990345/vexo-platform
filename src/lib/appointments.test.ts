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

import { setAppointmentReturnPeriod, isAppointmentVisibleInList, ATTENDED_VISIBLE_DAYS } from "./appointments";
import { startOfDay, addDays } from "@/lib/metrics";
import { DEMO_CLINIC_ID } from "@/lib/demo-clinic";

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

// Lista de Agendamentos do Painel (ver ClientPanelView.tsx) — pedido
// explícito: "Compareceu" (displayStatus COMPLETED) só fica visível por
// ATTENDED_VISIBLE_DAYS dias civis depois do atendimento; "limite no dia
// 3 e no dia 4" e "outros status" (futuros/Faltou seguem sempre visíveis).
describe("isAppointmentVisibleInList", () => {
  // scheduledAt fixo ao meio-dia UTC (longe da virada do dia civil em
  // qualquer fuso), pra isolar o teste da contagem de dias em si — mesmo
  // padrão de scheduledAt usado em reactivation.test.ts.
  const scheduledAt = new Date("2026-01-10T12:00:00.000Z");

  it(`dia ${ATTENDED_VISIBLE_DAYS} (limite): Compareceu ainda visível (prazo inclusivo)`, () => {
    const now = addDays(startOfDay(scheduledAt), ATTENDED_VISIBLE_DAYS);
    expect(isAppointmentVisibleInList({ status: "SCHEDULED", scheduledAt }, now)).toBe(true);
  });

  it(`dia ${ATTENDED_VISIBLE_DAYS + 1}: Compareceu some da lista (prazo excedido)`, () => {
    const now = addDays(startOfDay(scheduledAt), ATTENDED_VISIBLE_DAYS + 1);
    expect(isAppointmentVisibleInList({ status: "SCHEDULED", scheduledAt }, now)).toBe(false);
  });

  it("agendamento futuro (ainda não aconteceu): sempre visível, independente da idade", () => {
    const now = new Date(scheduledAt.getTime() - 60 * 60 * 1000);
    expect(isAppointmentVisibleInList({ status: "SCHEDULED", scheduledAt }, now)).toBe(true);
  });

  it(`"Não compareceu" (NO_SHOW): sempre visível, mesmo muito depois do prazo de ${ATTENDED_VISIBLE_DAYS} dias`, () => {
    const now = addDays(startOfDay(scheduledAt), 100);
    expect(isAppointmentVisibleInList({ status: "NO_SHOW", scheduledAt }, now)).toBe(true);
  });

  // Pedido explícito (depois da PR original: "a Clínica Demo ficou
  // vazia" — Compareceu antigos, ex.: 09/10 e 12/10, sumiram): a Clínica
  // Demo (DEMO_CLINIC_ID) fica ISENTA da regra, pra sempre mostrar todos
  // os agendamentos (testes/vídeos). Outras clínicas seguem a regra normal.
  it("Clínica Demo (DEMO_CLINIC_ID): Compareceu bem antigo continua visível, isenta da regra dos 3 dias", () => {
    const now = addDays(startOfDay(scheduledAt), 100);
    expect(isAppointmentVisibleInList({ status: "SCHEDULED", scheduledAt }, now, DEMO_CLINIC_ID)).toBe(true);
  });

  it("outra clínica (não-Demo): continua escondendo Compareceu depois do prazo, sem mudança", () => {
    const now = addDays(startOfDay(scheduledAt), ATTENDED_VISIBLE_DAYS + 1);
    expect(isAppointmentVisibleInList({ status: "SCHEDULED", scheduledAt }, now, "clinic-outra-qualquer")).toBe(false);
  });

  it("CONFIRMED (mesma regra de displayStatus que SCHEDULED) também some depois do prazo", () => {
    const now = addDays(startOfDay(scheduledAt), ATTENDED_VISIBLE_DAYS + 1);
    expect(isAppointmentVisibleInList({ status: "CONFIRMED", scheduledAt }, now)).toBe(false);
  });
});
