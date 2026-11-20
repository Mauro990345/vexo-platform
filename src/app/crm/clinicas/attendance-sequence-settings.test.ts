// Caixinha "Enviar" individual por item da sequência de confirmação de
// presença — validação no SERVIDOR (updateAiAgentSettings) de que o
// vídeo só pode ficar marcado com arquivo de verdade, e a frase de
// apresentação só com o vídeo também marcado. A tela já desabilita essas
// caixinhas nesses casos (AttendanceVideoSettings.tsx), mas isto aqui
// nunca pode ser a única linha de defesa.
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireInternalSessionMock = vi.fn();
vi.mock("@/lib/session", () => ({
  requireInternalSession: (...args: unknown[]) => requireInternalSessionMock(...args),
}));

const clinicUpdateMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { clinic: { update: (...args: unknown[]) => clinicUpdateMock(...args) } },
}));

const saveUploadedAttachmentMock = vi.fn();
const deleteUploadedAttachmentMock = vi.fn();
vi.mock("@/lib/uploads", () => ({
  saveUploadedAttachment: (...args: unknown[]) => saveUploadedAttachmentMock(...args),
  deleteUploadedAttachment: (...args: unknown[]) => deleteUploadedAttachmentMock(...args),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { updateAiAgentSettings } from "./actions";

function buildFormData(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireInternalSessionMock.mockResolvedValue({ user: { role: "INTERNAL_ADMIN" } });
  clinicUpdateMock.mockResolvedValue({});
  deleteUploadedAttachmentMock.mockResolvedValue(undefined);
});

describe("updateAiAgentSettings — caixinhas da sequência de confirmação de presença", () => {
  it("todas marcadas, com vídeo já salvo: grava as 4 como true", async () => {
    await updateAiAgentSettings(
      "clinic-1",
      buildFormData({
        currentConfirmationVideoUrl: "/uploads/video.mp4",
        confirmationVideoEnabled: "on",
        confirmationVideoCaptionEnabled: "on",
        attendanceTipEnabled: "on",
        attendanceFinalEnabled: "on",
      })
    );

    expect(clinicUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          confirmationVideoEnabled: true,
          confirmationVideoCaptionEnabled: true,
          attendanceTipEnabled: true,
          attendanceFinalEnabled: true,
        }),
      })
    );
  });

  it("vídeo marcado mas SEM nenhum arquivo (nem salvo, nem enviado agora): bloqueado no servidor — vira false, e a apresentação também", async () => {
    await updateAiAgentSettings(
      "clinic-1",
      buildFormData({
        currentConfirmationVideoUrl: "",
        confirmationVideoEnabled: "on",
        confirmationVideoCaptionEnabled: "on",
        attendanceTipEnabled: "on",
        attendanceFinalEnabled: "on",
      })
    );

    const data = clinicUpdateMock.mock.calls[0]![0].data;
    expect(data.confirmationVideoEnabled).toBe(false);
    expect(data.confirmationVideoCaptionEnabled).toBe(false);
    // Sem relação com o vídeo — continuam como enviadas.
    expect(data.attendanceTipEnabled).toBe(true);
    expect(data.attendanceFinalEnabled).toBe(true);
  });

  it("apresentação marcada mas vídeo DESMARCADO (mesmo com arquivo salvo): apresentação vira false — só pode estar marcada junto do vídeo", async () => {
    await updateAiAgentSettings(
      "clinic-1",
      buildFormData({
        currentConfirmationVideoUrl: "/uploads/video.mp4",
        confirmationVideoCaptionEnabled: "on",
        // confirmationVideoEnabled OMITIDO (desmarcado)
      })
    );

    const data = clinicUpdateMock.mock.calls[0]![0].data;
    expect(data.confirmationVideoEnabled).toBe(false);
    expect(data.confirmationVideoCaptionEnabled).toBe(false);
  });

  it('arquivo removido nesta mesma submissão ("Remover" marcado, sem arquivo novo): vídeo e apresentação viram false mesmo que marcados', async () => {
    await updateAiAgentSettings(
      "clinic-1",
      buildFormData({
        currentConfirmationVideoUrl: "/uploads/video-antigo.mp4",
        removeConfirmationVideo: "on",
        confirmationVideoEnabled: "on",
        confirmationVideoCaptionEnabled: "on",
      })
    );

    const data = clinicUpdateMock.mock.calls[0]![0].data;
    expect(data.confirmationVideoUrl).toBeNull();
    expect(data.confirmationVideoEnabled).toBe(false);
    expect(data.confirmationVideoCaptionEnabled).toBe(false);
  });

  it("nenhuma caixinha marcada: grava as 4 como false (a sequência não dispara)", async () => {
    await updateAiAgentSettings("clinic-1", buildFormData({ currentConfirmationVideoUrl: "/uploads/video.mp4" }));

    const data = clinicUpdateMock.mock.calls[0]![0].data;
    expect(data.confirmationVideoEnabled).toBe(false);
    expect(data.confirmationVideoCaptionEnabled).toBe(false);
    expect(data.attendanceTipEnabled).toBe(false);
    expect(data.attendanceFinalEnabled).toBe(false);
  });

  it("só a mensagem final marcada: grava normalmente, sem depender do vídeo", async () => {
    await updateAiAgentSettings(
      "clinic-1",
      buildFormData({ currentConfirmationVideoUrl: "", attendanceFinalEnabled: "on" })
    );

    const data = clinicUpdateMock.mock.calls[0]![0].data;
    expect(data.attendanceFinalEnabled).toBe(true);
    expect(data.confirmationVideoEnabled).toBe(false);
    expect(data.confirmationVideoCaptionEnabled).toBe(false);
    expect(data.attendanceTipEnabled).toBe(false);
  });
});
