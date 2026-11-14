import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks mínimos — mesmo padrão de reminders.test.ts/lead-profile-picture-backfill
// (se existisse): só as peças que refreshAllInstagramTokens realmente usa
// recebem implementação de verdade.
const instagramAccountFindManyMock = vi.fn();
const instagramAccountUpdateMock = vi.fn();
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
  encryptToken: (token: string) => `encrypted:${token}`,
}));

const refreshInstagramLongLivedTokenMock = vi.fn();
const debugInstagramTokenMock = vi.fn();
const markInstagramNeedsReconnectByIgUserIdMock = vi.fn();
vi.mock("@/lib/instagram", () => ({
  refreshInstagramLongLivedToken: (...args: unknown[]) => refreshInstagramLongLivedTokenMock(...args),
  debugInstagramToken: (...args: unknown[]) => debugInstagramTokenMock(...args),
  markInstagramNeedsReconnectByIgUserId: (...args: unknown[]) => markInstagramNeedsReconnectByIgUserIdMock(...args),
}));

import {
  decideInstagramTokenRefreshAction,
  refreshAllInstagramTokens,
  INSTAGRAM_TOKEN_REFRESH_WINDOW_DAYS,
} from "@/lib/instagram-token-refresh";

const NOW = new Date("2026-11-14T12:00:00Z");

function daysFromNow(days: number): Date {
  return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000);
}

// Peça pura — mesma cobertura de shouldBackfillHistory em
// conversation-pipeline.test.ts (primeira conversa / dentro da janela /
// fora da janela / limiar exato / sem base pra decidir).
describe("decideInstagramTokenRefreshAction", () => {
  it("sem tokenExpiresAt salvo (toda conta de Instagram antes desta correção): backfill_expiry", () => {
    expect(decideInstagramTokenRefreshAction(null, NOW)).toBe("backfill_expiry");
  });

  it("token já vencido (tokenExpiresAt no passado): already_expired — nunca tenta renovar", () => {
    expect(decideInstagramTokenRefreshAction(daysFromNow(-1), NOW)).toBe("already_expired");
  });

  it(`faltam ${INSTAGRAM_TOKEN_REFRESH_WINDOW_DAYS - 1} dias pra vencer (dentro da janela, ainda válido): refresh`, () => {
    expect(decideInstagramTokenRefreshAction(daysFromNow(INSTAGRAM_TOKEN_REFRESH_WINDOW_DAYS - 1), NOW)).toBe("refresh");
  });

  it("exatamente no limiar da janela: refresh (<=, não só <)", () => {
    expect(decideInstagramTokenRefreshAction(daysFromNow(INSTAGRAM_TOKEN_REFRESH_WINDOW_DAYS), NOW)).toBe("refresh");
  });

  it(`faltam mais de ${INSTAGRAM_TOKEN_REFRESH_WINDOW_DAYS} dias pra vencer: skip — não gasta chamada à Meta à toa`, () => {
    expect(decideInstagramTokenRefreshAction(daysFromNow(INSTAGRAM_TOKEN_REFRESH_WINDOW_DAYS + 1), NOW)).toBe("skip");
  });
});

function buildAccount(overrides: Partial<{ id: string; clinicId: string; igUserId: string; accessTokenEnc: string; tokenExpiresAt: Date | null }> = {}) {
  return {
    id: "ig-acc-1",
    clinicId: "clinic-1",
    igUserId: "17841400000000000",
    accessTokenEnc: "enc-token-1",
    tokenExpiresAt: null,
    ...overrides,
  };
}

describe("refreshAllInstagramTokens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  // Cenário "Clínica Demo" pedido pelo usuário: token já vencido — nunca
  // tenta chamar ig_refresh_token (não funcionaria mesmo, regra documentada
  // da Meta), marca precisa-reconectar direto.
  it("token já vencido: marca precisa-reconectar SEM chamar refreshInstagramLongLivedToken", async () => {
    instagramAccountFindManyMock.mockResolvedValue([buildAccount({ tokenExpiresAt: daysFromNow(-2) })]);

    const result = await refreshAllInstagramTokens();

    expect(result).toEqual({ refreshed: 0, markedNeedsReconnect: 1, backfilled: 0, skipped: 0 });
    expect(refreshInstagramLongLivedTokenMock).not.toHaveBeenCalled();
    expect(markInstagramNeedsReconnectByIgUserIdMock).toHaveBeenCalledWith("17841400000000000", expect.stringContaining("vencido"));
  });

  it("dentro da janela de 15 dias, token ainda válido: renova e GRAVA o novo token cifrado + vencimento, limpando precisa-reconectar", async () => {
    instagramAccountFindManyMock.mockResolvedValue([buildAccount({ tokenExpiresAt: daysFromNow(10) })]);
    const newExpiresAt = daysFromNow(70);
    refreshInstagramLongLivedTokenMock.mockResolvedValue({ accessToken: "novo-token-cru", tokenExpiresAt: newExpiresAt });

    const result = await refreshAllInstagramTokens();

    expect(result).toEqual({ refreshed: 1, markedNeedsReconnect: 0, backfilled: 0, skipped: 0 });
    expect(refreshInstagramLongLivedTokenMock).toHaveBeenCalledWith("decrypted:enc-token-1");
    expect(instagramAccountUpdateMock).toHaveBeenCalledWith({
      where: { id: "ig-acc-1" },
      data: {
        accessTokenEnc: "encrypted:novo-token-cru",
        tokenExpiresAt: newExpiresAt,
        needsReconnectAt: null,
        needsReconnectReason: null,
      },
    });
  });

  // SE A RENOVAÇÃO FALHAR (pedido explícito) — marca precisa-reconectar.
  it("renovação falha (ex: sessão já expirou na prática, apesar de tokenExpiresAt ainda não ter passado): marca precisa-reconectar", async () => {
    instagramAccountFindManyMock.mockResolvedValue([buildAccount({ tokenExpiresAt: daysFromNow(5) })]);
    refreshInstagramLongLivedTokenMock.mockRejectedValue(new Error("Falha ao renovar token de longa duração (HTTP 400): sessão expirada"));

    const result = await refreshAllInstagramTokens();

    expect(result).toEqual({ refreshed: 0, markedNeedsReconnect: 1, backfilled: 0, skipped: 0 });
    expect(markInstagramNeedsReconnectByIgUserIdMock).toHaveBeenCalledWith("17841400000000000", expect.stringContaining("Falha ao renovar token"));
    expect(instagramAccountUpdateMock).not.toHaveBeenCalled();
  });

  it("fora da janela (mais de 15 dias pra vencer): skip — nenhuma chamada à Meta", async () => {
    instagramAccountFindManyMock.mockResolvedValue([buildAccount({ tokenExpiresAt: daysFromNow(40) })]);

    const result = await refreshAllInstagramTokens();

    expect(result).toEqual({ refreshed: 0, markedNeedsReconnect: 0, backfilled: 0, skipped: 1 });
    expect(refreshInstagramLongLivedTokenMock).not.toHaveBeenCalled();
    expect(debugInstagramTokenMock).not.toHaveBeenCalled();
  });

  // Pedido explícito: "se não existir campo de vencimento salvo... preencha
  // para as contas atuais" — sem tokenExpiresAt, descobre via debug_token
  // (leitura sem side effect) em vez de arriscar um refresh às ciegas.
  it("sem tokenExpiresAt salvo + debug_token confirma válido: PREENCHE tokenExpiresAt (backfill), sem marcar nada de errado", async () => {
    instagramAccountFindManyMock.mockResolvedValue([buildAccount({ tokenExpiresAt: null })]);
    const discoveredExpiresAt = daysFromNow(35);
    debugInstagramTokenMock.mockResolvedValue({ isValid: true, expiresAt: discoveredExpiresAt });

    const result = await refreshAllInstagramTokens();

    expect(result).toEqual({ refreshed: 0, markedNeedsReconnect: 0, backfilled: 1, skipped: 0 });
    expect(instagramAccountUpdateMock).toHaveBeenCalledWith({
      where: { id: "ig-acc-1" },
      data: { tokenExpiresAt: discoveredExpiresAt },
    });
    expect(markInstagramNeedsReconnectByIgUserIdMock).not.toHaveBeenCalled();
  });

  it("sem tokenExpiresAt salvo + debug_token confirma INVÁLIDO: marca precisa-reconectar, sem gravar tokenExpiresAt", async () => {
    instagramAccountFindManyMock.mockResolvedValue([buildAccount({ tokenExpiresAt: null })]);
    debugInstagramTokenMock.mockResolvedValue({ isValid: false, expiresAt: null });

    const result = await refreshAllInstagramTokens();

    expect(result).toEqual({ refreshed: 0, markedNeedsReconnect: 1, backfilled: 0, skipped: 0 });
    expect(markInstagramNeedsReconnectByIgUserIdMock).toHaveBeenCalledWith("17841400000000000", expect.stringContaining("debug_token"));
    expect(instagramAccountUpdateMock).not.toHaveBeenCalled();
  });

  it("sem tokenExpiresAt salvo + debug_token falha (env vars ausentes/rede — nunca fatal): skip, sem marcar nada", async () => {
    instagramAccountFindManyMock.mockResolvedValue([buildAccount({ tokenExpiresAt: null })]);
    debugInstagramTokenMock.mockResolvedValue(null);

    const result = await refreshAllInstagramTokens();

    expect(result).toEqual({ refreshed: 0, markedNeedsReconnect: 0, backfilled: 0, skipped: 1 });
    expect(markInstagramNeedsReconnectByIgUserIdMock).not.toHaveBeenCalled();
    expect(instagramAccountUpdateMock).not.toHaveBeenCalled();
  });

  it("uma conta falhando não impede as outras de serem processadas no mesmo ciclo", async () => {
    instagramAccountFindManyMock.mockResolvedValue([
      buildAccount({ id: "ig-acc-bad", clinicId: "clinic-bad", igUserId: "111", tokenExpiresAt: daysFromNow(5) }),
      buildAccount({ id: "ig-acc-good", clinicId: "clinic-good", igUserId: "222", tokenExpiresAt: daysFromNow(5) }),
    ]);
    // Primeira chamada (ig-acc-bad, processada antes no array) falha, a
    // segunda (ig-acc-good) sucede — simula "uma conta ruim no meio do lote".
    refreshInstagramLongLivedTokenMock
      .mockRejectedValueOnce(new Error("falha simulada"))
      .mockResolvedValueOnce({ accessToken: "novo-token", tokenExpiresAt: daysFromNow(70) });

    const result = await refreshAllInstagramTokens();

    expect(result).toEqual({ refreshed: 1, markedNeedsReconnect: 1, backfilled: 0, skipped: 0 });
  });
});
