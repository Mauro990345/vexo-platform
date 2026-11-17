import { describe, it, expect, vi, beforeEach } from "vitest";

const requireInternalSessionMock = vi.fn();
vi.mock("@/lib/session", () => ({
  requireInternalSession: (...args: unknown[]) => requireInternalSessionMock(...args),
}));

const clinicFindManyMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { clinic: { findMany: (...args: unknown[]) => clinicFindManyMock(...args) } },
}));

import { listClinicsForPrep } from "./actions";

// "N na fila" (contador de leads restantes, ver DESIGN.md) — a contagem
// vem de _count.approachQueueItems (relação filtrada por status QUEUED,
// resolvida na mesma query, sem N+1) e precisa chegar como leadsRemaining
// no objeto que a tela de Preparação consome.
describe("listClinicsForPrep — leadsRemaining", () => {
  beforeEach(() => {
    requireInternalSessionMock.mockReset().mockResolvedValue({});
    clinicFindManyMock.mockReset();
  });

  it("repassa _count.approachQueueItems como leadsRemaining", async () => {
    clinicFindManyMock.mockResolvedValue([
      {
        id: "clinic-1",
        name: "Clínica Demo",
        instagramAccount: { igUsername: "clinica.demo" },
        approachQueueConfig: { dailyLimit: 60, activeInQueue: true, paused: false },
        approachMessagesConfig: { message1: "Oi!" },
        _count: { approachQueueItems: 320 },
      },
    ]);

    const clinics = await listClinicsForPrep();

    expect(clinics).toEqual([
      {
        id: "clinic-1",
        name: "Clínica Demo",
        igUsername: "clinica.demo",
        dailyLimit: 60,
        activeInQueue: true,
        paused: false,
        hasMessages: true,
        leadsRemaining: 320,
      },
    ]);
    // A contagem veio filtrada por status QUEUED (nunca enviados/pulados).
    expect(clinicFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ _count: { select: { approachQueueItems: { where: { status: "QUEUED" } } } } }),
      })
    );
  });

  it("fila vazia -> leadsRemaining 0", async () => {
    clinicFindManyMock.mockResolvedValue([
      {
        id: "clinic-1",
        name: "Clínica Demo",
        instagramAccount: null,
        approachQueueConfig: null,
        approachMessagesConfig: null,
        _count: { approachQueueItems: 0 },
      },
    ]);

    const clinics = await listClinicsForPrep();
    expect(clinics[0]?.leadsRemaining).toBe(0);
  });
});
