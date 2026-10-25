import { describe, it, expect, vi, beforeEach } from "vitest";

const clinicFindUniqueOrThrowMock = vi.fn();
const clinicUpdateMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    clinic: {
      findUniqueOrThrow: (...args: unknown[]) => clinicFindUniqueOrThrowMock(...args),
      update: (...args: unknown[]) => clinicUpdateMock(...args),
    },
  },
}));

const createWhatsappInstanceMock = vi.fn();
const fetchWhatsappConnectionStateMock = vi.fn();
const fetchWhatsappQrMock = vi.fn();
const logoutWhatsappInstanceMock = vi.fn();
const whatsappInstanceExistsMock = vi.fn();
vi.mock("@/lib/whatsapp-instance", () => ({
  createWhatsappInstance: (...args: unknown[]) => createWhatsappInstanceMock(...args),
  fetchWhatsappConnectionState: (...args: unknown[]) => fetchWhatsappConnectionStateMock(...args),
  fetchWhatsappQr: (...args: unknown[]) => fetchWhatsappQrMock(...args),
  logoutWhatsappInstance: (...args: unknown[]) => logoutWhatsappInstanceMock(...args),
  whatsappInstanceExists: (...args: unknown[]) => whatsappInstanceExistsMock(...args),
}));

import {
  ensureWhatsappQrForClinic,
  refreshWhatsappStatus,
  shouldShowWhatsappResetAction,
  whatsappResetActionLabel,
} from "./whatsapp-connection";

function fakeClinic(overrides: Record<string, unknown> = {}) {
  return { id: "clinic-1", slug: "clinica-demo", whatsappInstanceName: "clinica-demo", ...overrides };
}

// Bug real investigado: ensureWhatsappQrForClinic rodava createWhatsappInstance
// em TODO carregamento da tela, mesmo pra uma instância já existente há
// meses — arriscado na Evolution 2.3.7.
describe("ensureWhatsappQrForClinic", () => {
  beforeEach(() => {
    clinicFindUniqueOrThrowMock.mockReset();
    clinicUpdateMock.mockReset();
    createWhatsappInstanceMock.mockReset();
    fetchWhatsappQrMock.mockReset();
    whatsappInstanceExistsMock.mockReset();
    fetchWhatsappQrMock.mockResolvedValue({ qrBase64: "data:image/png;base64,xyz" });
  });

  it("instância NÃO existe (whatsappInstanceExists=false): cria antes de pedir o QR", async () => {
    clinicFindUniqueOrThrowMock.mockResolvedValue(fakeClinic());
    whatsappInstanceExistsMock.mockResolvedValue(false);

    await ensureWhatsappQrForClinic("clinic-1");

    expect(whatsappInstanceExistsMock).toHaveBeenCalledWith("clinica-demo");
    expect(createWhatsappInstanceMock).toHaveBeenCalledWith("clinica-demo");
    expect(fetchWhatsappQrMock).toHaveBeenCalledWith("clinica-demo");
  });

  it("instância JÁ existe (whatsappInstanceExists=true): NUNCA chama createWhatsappInstance, só pede o QR", async () => {
    clinicFindUniqueOrThrowMock.mockResolvedValue(fakeClinic());
    whatsappInstanceExistsMock.mockResolvedValue(true);

    await ensureWhatsappQrForClinic("clinic-1");

    expect(createWhatsappInstanceMock).not.toHaveBeenCalled();
    expect(fetchWhatsappQrMock).toHaveBeenCalledWith("clinica-demo");
  });
});

// Usada pelo poll leve do card de conexão (ver checkWhatsappConnectionStateAction,
// crm/clinicas/actions.ts, e WhatsappConnectionPanel.tsx) — pedido
// explícito: o poll NUNCA pode chamar create/connect, só consultar
// status, pra nunca trocar o QR embaixo de quem está escaneando.
describe("refreshWhatsappStatus — nunca cria instância nem pede QR novo", () => {
  beforeEach(() => {
    clinicFindUniqueOrThrowMock.mockReset();
    clinicUpdateMock.mockReset();
    createWhatsappInstanceMock.mockReset();
    fetchWhatsappConnectionStateMock.mockReset();
    fetchWhatsappQrMock.mockReset();
    whatsappInstanceExistsMock.mockReset();
  });

  it("só consulta connectionState e grava o resultado no banco", async () => {
    clinicFindUniqueOrThrowMock.mockResolvedValue(fakeClinic());
    fetchWhatsappConnectionStateMock.mockResolvedValue("connecting");

    const state = await refreshWhatsappStatus("clinic-1");

    expect(state).toBe("connecting");
    expect(fetchWhatsappConnectionStateMock).toHaveBeenCalledWith("clinica-demo");
    expect(clinicUpdateMock).toHaveBeenCalledWith({
      where: { id: "clinic-1" },
      data: { whatsappStatus: "connecting", whatsappStatusCheckedAt: expect.any(Date) },
    });
  });

  it("nunca chama createWhatsappInstance, fetchWhatsappQr nem whatsappInstanceExists", async () => {
    clinicFindUniqueOrThrowMock.mockResolvedValue(fakeClinic());
    fetchWhatsappConnectionStateMock.mockResolvedValue("open");

    await refreshWhatsappStatus("clinic-1");

    expect(createWhatsappInstanceMock).not.toHaveBeenCalled();
    expect(fetchWhatsappQrMock).not.toHaveBeenCalled();
    expect(whatsappInstanceExistsMock).not.toHaveBeenCalled();
  });
});

// Pedido explícito (item 1): o botão de reset aparecia só em "open" —
// passa a aparecer também em "connecting", onde é o único jeito de sair
// de uma sessão travada.
describe("shouldShowWhatsappResetAction / whatsappResetActionLabel", () => {
  it('"open": aparece, rotulado "Desconectar"', () => {
    expect(shouldShowWhatsappResetAction("open")).toBe(true);
    expect(whatsappResetActionLabel("open")).toBe("Desconectar");
  });

  it('"connecting": aparece, rotulado "Reiniciar pareamento" (era invisível antes deste ajuste)', () => {
    expect(shouldShowWhatsappResetAction("connecting")).toBe(true);
    expect(whatsappResetActionLabel("connecting")).toBe("Reiniciar pareamento");
  });

  it('"close" e "unknown": não aparece', () => {
    expect(shouldShowWhatsappResetAction("close")).toBe(false);
    expect(shouldShowWhatsappResetAction("unknown")).toBe(false);
  });
});
