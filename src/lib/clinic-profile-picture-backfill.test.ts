import { beforeEach, describe, expect, it, vi } from "vitest";

const instagramAccountFindManyMock = vi.fn();
const instagramAccountUpdateMock = vi.fn();
const getInstagramAccountProfilePictureMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    instagramAccount: {
      findMany: (...args: unknown[]) => instagramAccountFindManyMock(...args),
      update: (...args: unknown[]) => instagramAccountUpdateMock(...args),
    },
  },
}));

vi.mock("@/lib/crypto", () => ({
  decryptToken: (enc: string) => `decrypted:${enc}`,
}));

vi.mock("@/lib/instagram", () => ({
  getInstagramAccountProfilePicture: (...args: unknown[]) => getInstagramAccountProfilePictureMock(...args),
}));

import { refreshClinicProfilePictures } from "./clinic-profile-picture-backfill";

beforeEach(() => {
  instagramAccountFindManyMock.mockReset().mockResolvedValue([]);
  instagramAccountUpdateMock.mockReset().mockResolvedValue({});
  getInstagramAccountProfilePictureMock.mockReset();
});

describe("refreshClinicProfilePictures", () => {
  it("só busca contas sem needsReconnectAt, sem foto OU com foto vencida (>24h)", async () => {
    await refreshClinicProfilePictures();

    expect(instagramAccountFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          needsReconnectAt: null,
          OR: [{ profilePictureFetchedAt: null }, { profilePictureFetchedAt: { lt: expect.any(Date) } }],
        }),
      })
    );
  });

  it("renovação funciona: busca a foto nova, grava URL + timestamp, conta como atualizada", async () => {
    instagramAccountFindManyMock.mockResolvedValue([{ clinicId: "clinic-1", accessTokenEnc: "enc-token" }]);
    getInstagramAccountProfilePictureMock.mockResolvedValue("https://scontent.cdninstagram.com/nova-foto.jpg");

    const result = await refreshClinicProfilePictures();

    expect(getInstagramAccountProfilePictureMock).toHaveBeenCalledWith("decrypted:enc-token");
    expect(instagramAccountUpdateMock).toHaveBeenCalledWith({
      where: { clinicId: "clinic-1" },
      data: { profilePictureUrl: "https://scontent.cdninstagram.com/nova-foto.jpg", profilePictureFetchedAt: expect.any(Date) },
    });
    expect(result).toEqual({ updated: 1, attempted: 1 });
  });

  it("conta sem foto na resposta da Meta: grava null + timestamp (não conta como 'updated', mas também não falha)", async () => {
    instagramAccountFindManyMock.mockResolvedValue([{ clinicId: "clinic-1", accessTokenEnc: "enc-token" }]);
    getInstagramAccountProfilePictureMock.mockResolvedValue(null);

    const result = await refreshClinicProfilePictures();

    expect(instagramAccountUpdateMock).toHaveBeenCalledWith({
      where: { clinicId: "clinic-1" },
      data: { profilePictureUrl: null, profilePictureFetchedAt: expect.any(Date) },
    });
    expect(result).toEqual({ updated: 0, attempted: 1 });
  });

  it("erro de rede/token: NÃO grava fetchedAt (tenta de novo no próximo ciclo), não derruba as outras contas do lote", async () => {
    instagramAccountFindManyMock.mockResolvedValue([
      { clinicId: "clinic-com-erro", accessTokenEnc: "enc-1" },
      { clinicId: "clinic-ok", accessTokenEnc: "enc-2" },
    ]);
    getInstagramAccountProfilePictureMock.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce("https://scontent.cdninstagram.com/ok.jpg");

    const result = await refreshClinicProfilePictures();

    expect(instagramAccountUpdateMock).toHaveBeenCalledTimes(1);
    expect(instagramAccountUpdateMock).toHaveBeenCalledWith({
      where: { clinicId: "clinic-ok" },
      data: { profilePictureUrl: "https://scontent.cdninstagram.com/ok.jpg", profilePictureFetchedAt: expect.any(Date) },
    });
    expect(result).toEqual({ updated: 1, attempted: 2 });
  });

  it("nenhuma conta pra renovar — não chama a API nem o update", async () => {
    const result = await refreshClinicProfilePictures();
    expect(getInstagramAccountProfilePictureMock).not.toHaveBeenCalled();
    expect(instagramAccountUpdateMock).not.toHaveBeenCalled();
    expect(result).toEqual({ updated: 0, attempted: 0 });
  });
});
