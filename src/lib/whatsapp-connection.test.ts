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
const deleteWhatsappInstanceMock = vi.fn();
const fetchWhatsappConnectionStateMock = vi.fn();
const fetchWhatsappQrMock = vi.fn();
const logoutWhatsappInstanceMock = vi.fn();
const whatsappInstanceExistsMock = vi.fn();
// EvolutionInstanceNotFoundError/EvolutionInstanceNameInUseError precisam
// ser as classes DE VERDADE (vi.importActual), não mocks — o código real
// (ensureWhatsappQrForClinic) decide o que fazer com `instanceof` sobre o
// que createWhatsappInstanceMock/fetchWhatsappQrMock rejeitam nos testes
// abaixo; se fossem classes falsas, o `instanceof` nunca bateria.
vi.mock("@/lib/whatsapp-instance", async () => {
  const actual = await vi.importActual<typeof import("./whatsapp-instance")>("./whatsapp-instance");
  return {
    EvolutionInstanceNotFoundError: actual.EvolutionInstanceNotFoundError,
    EvolutionInstanceNameInUseError: actual.EvolutionInstanceNameInUseError,
    createWhatsappInstance: (...args: unknown[]) => createWhatsappInstanceMock(...args),
    deleteWhatsappInstance: (...args: unknown[]) => deleteWhatsappInstanceMock(...args),
    fetchWhatsappConnectionState: (...args: unknown[]) => fetchWhatsappConnectionStateMock(...args),
    fetchWhatsappQr: (...args: unknown[]) => fetchWhatsappQrMock(...args),
    logoutWhatsappInstance: (...args: unknown[]) => logoutWhatsappInstanceMock(...args),
    whatsappInstanceExists: (...args: unknown[]) => whatsappInstanceExistsMock(...args),
  };
});

import { EvolutionInstanceNotFoundError, EvolutionInstanceNameInUseError } from "./whatsapp-instance";
import {
  ensureWhatsappQrForClinic,
  refreshWhatsappStatus,
  resetWhatsappPairing,
  shouldShowWhatsappResetAction,
  whatsappResetActionLabel,
  isWhatsappPairingStuck,
  describeWhatsappConnectionError,
  generateFreshWhatsappInstanceName,
  WHATSAPP_PAIRING_STUCK_THRESHOLD_MS,
} from "./whatsapp-connection";

function fakeClinic(overrides: Record<string, unknown> = {}) {
  return { id: "clinic-1", slug: "clinica-demo", whatsappInstanceName: "clinica-demo", ...overrides };
}

// Bug real investigado: ensureWhatsappQrForClinic rodava createWhatsappInstance
// em TODO carregamento da tela, mesmo pra uma instância já existente há
// meses — arriscado na Evolution 2.3.7. Depois (produção, Evolution 2.3.7
// com patch do baileys): um palpite ambíguo (timeout na listagem) ou uma
// instância "fantasma" (existe no banco da Evolution/Manager, mas não
// carregada em memória — connect devolve 404/400 "does not exist") deixava
// o QR simplesmente falhar, sem recuperação nenhuma — só dava pra resolver
// abrindo o Manager na mão. Os 4 testes abaixo (pedido explícito, item "e")
// cobrem os cenários reais investigados.
describe("ensureWhatsappQrForClinic", () => {
  beforeEach(() => {
    clinicFindUniqueOrThrowMock.mockReset();
    clinicUpdateMock.mockReset();
    createWhatsappInstanceMock.mockReset();
    fetchWhatsappQrMock.mockReset();
    whatsappInstanceExistsMock.mockReset();
    clinicFindUniqueOrThrowMock.mockResolvedValue(fakeClinic());
    fetchWhatsappQrMock.mockResolvedValue({ qrBase64: "data:image/png;base64,xyz" });
  });

  it("instância existente (whatsappInstanceExists=true, connect funciona de primeira): não cria, não recupera", async () => {
    whatsappInstanceExistsMock.mockResolvedValue(true);

    const result = await ensureWhatsappQrForClinic("clinic-1");

    expect(createWhatsappInstanceMock).not.toHaveBeenCalled();
    expect(fetchWhatsappQrMock).toHaveBeenCalledWith("clinica-demo");
    expect(result).toEqual({ instanceName: "clinica-demo", qrBase64: "data:image/png;base64,xyz", recovered: false });
  });

  it("instância NÃO existe (whatsappInstanceExists=false): cria antes de pedir o QR", async () => {
    whatsappInstanceExistsMock.mockResolvedValue(false);

    await ensureWhatsappQrForClinic("clinic-1");

    expect(whatsappInstanceExistsMock).toHaveBeenCalledWith("clinica-demo");
    expect(createWhatsappInstanceMock).toHaveBeenCalledWith("clinica-demo");
    expect(fetchWhatsappQrMock).toHaveBeenCalledWith("clinica-demo");
  });

  // Item "a": connect diz "não existe" -> cria com o MESMO nome e
  // conecta, sem precisar de nome novo (a instância só estava mesmo
  // ausente, não era uma fantasma barrando o nome).
  it('404 (EvolutionInstanceNotFoundError no connect): cria com o MESMO nome e conecta de novo', async () => {
    whatsappInstanceExistsMock.mockResolvedValue(true);
    fetchWhatsappQrMock
      .mockRejectedValueOnce(new EvolutionInstanceNotFoundError("clinica-demo"))
      .mockResolvedValueOnce({ qrBase64: "data:image/png;base64,recuperado" });

    const result = await ensureWhatsappQrForClinic("clinic-1");

    expect(createWhatsappInstanceMock).toHaveBeenCalledTimes(1);
    expect(createWhatsappInstanceMock).toHaveBeenCalledWith("clinica-demo", { tolerateConflict: false });
    expect(fetchWhatsappQrMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      instanceName: "clinica-demo",
      qrBase64: "data:image/png;base64,recuperado",
      recovered: true,
    });
    // nunca troca o nome salvo nesse caminho (não era uma fantasma)
    expect(clinicUpdateMock).not.toHaveBeenCalled();
  });

  // Item "a": connect diz "não existe" E o create com o mesmo nome diz
  // "já em uso" (a própria instância fantasma barrando o nome) -> desiste
  // do nome atual, gera um novo, salva, cria e conecta — ÚLTIMA tentativa.
  it('"name already in use" depois do 404: desiste do nome atual, gera um novo, salva e conecta', async () => {
    whatsappInstanceExistsMock.mockResolvedValue(true);
    fetchWhatsappQrMock
      .mockRejectedValueOnce(new EvolutionInstanceNotFoundError("clinica-demo"))
      .mockResolvedValueOnce({ qrBase64: "data:image/png;base64,novo-nome" });
    createWhatsappInstanceMock
      .mockRejectedValueOnce(new EvolutionInstanceNameInUseError("clinica-demo"))
      .mockResolvedValueOnce(undefined);

    const result = await ensureWhatsappQrForClinic("clinic-1");

    expect(createWhatsappInstanceMock).toHaveBeenCalledTimes(2);
    expect(createWhatsappInstanceMock).toHaveBeenNthCalledWith(1, "clinica-demo", { tolerateConflict: false });
    const secondCallName = createWhatsappInstanceMock.mock.calls[1]?.[0] as string;
    expect(secondCallName).toMatch(/^clinica-demo-[0-9a-f]{6}$/);
    expect(secondCallName).not.toBe("clinica-demo");
    expect(createWhatsappInstanceMock).toHaveBeenNthCalledWith(2, secondCallName, { tolerateConflict: false });
    expect(fetchWhatsappQrMock).toHaveBeenLastCalledWith(secondCallName);
    expect(clinicUpdateMock).toHaveBeenCalledWith({ where: { id: "clinic-1" }, data: { whatsappInstanceName: secondCallName } });
    expect(result).toEqual({ instanceName: secondCallName, qrBase64: "data:image/png;base64,novo-nome", recovered: true });
  });

  // Sem loop (pedido explícito, item "a"): se o create com o nome NOVO
  // falhar de novo por "already in use" (cenário improvável, mas não pode
  // virar laço infinito), não tenta um terceiro nome — propaga o erro.
  it("sem loop: 'already in use' também no nome novo propaga o erro em vez de tentar de novo", async () => {
    whatsappInstanceExistsMock.mockResolvedValue(true);
    fetchWhatsappQrMock.mockRejectedValue(new EvolutionInstanceNotFoundError("clinica-demo"));
    createWhatsappInstanceMock.mockRejectedValue(new EvolutionInstanceNameInUseError("clinica-demo"));

    await expect(ensureWhatsappQrForClinic("clinic-1")).rejects.toThrow(EvolutionInstanceNameInUseError);
    expect(createWhatsappInstanceMock).toHaveBeenCalledTimes(2);
  });

  // Item "c": timeout na listagem (whatsappInstanceExists ambíguo) não
  // pode travar a recuperação — o connect é tentado direto, e se
  // funcionar (a instância existia de verdade, só a listagem é que não
  // respondeu a tempo), segue normal, sem nenhuma recuperação.
  it("timeout na listagem (whatsappInstanceExists ambíguo, devolve true): ainda assim tenta e consegue conectar direto", async () => {
    whatsappInstanceExistsMock.mockResolvedValue(true); // mesmo retorno de um timeout/erro de rede, ver whatsapp-instance.test.ts

    const result = await ensureWhatsappQrForClinic("clinic-1");

    expect(createWhatsappInstanceMock).not.toHaveBeenCalled();
    expect(fetchWhatsappQrMock).toHaveBeenCalledTimes(1);
    expect(result.recovered).toBe(false);
    expect(result.qrBase64).toBe("data:image/png;base64,xyz");
  });

  it("erro genérico (não é EvolutionInstanceNotFoundError): propaga direto, sem tentar recuperar", async () => {
    whatsappInstanceExistsMock.mockResolvedValue(true);
    fetchWhatsappQrMock.mockRejectedValue(new Error("Evolution fora do ar"));

    await expect(ensureWhatsappQrForClinic("clinic-1")).rejects.toThrow("Evolution fora do ar");
    expect(createWhatsappInstanceMock).not.toHaveBeenCalled();
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

// "Reiniciar pareamento" (status "connecting") — bug real investigado:
// logout sozinho não limpa uma sessão/credenciais corrompidas do lado da
// Evolution. resetWhatsappPairing APAGA a instância e nunca recria
// sozinha (a próxima carga da tela de conexão já faz isso, via
// ensureWhatsappQrForClinic).
describe("resetWhatsappPairing", () => {
  beforeEach(() => {
    clinicFindUniqueOrThrowMock.mockReset();
    clinicUpdateMock.mockReset();
    deleteWhatsappInstanceMock.mockReset();
    createWhatsappInstanceMock.mockReset();
    fetchWhatsappQrMock.mockReset();
    deleteWhatsappInstanceMock.mockResolvedValue({ notFound: false });
  });

  it("apaga a instância e limpa o status salvo", async () => {
    clinicFindUniqueOrThrowMock.mockResolvedValue(fakeClinic());

    await resetWhatsappPairing("clinic-1");

    expect(deleteWhatsappInstanceMock).toHaveBeenCalledWith("clinica-demo");
    expect(clinicUpdateMock).toHaveBeenCalledWith({
      where: { id: "clinic-1" },
      data: { whatsappStatus: null, whatsappStatusCheckedAt: null },
    });
  });

  it("NUNCA recria sozinha (createWhatsappInstance/fetchWhatsappQr ficam pra próxima carga da tela)", async () => {
    clinicFindUniqueOrThrowMock.mockResolvedValue(fakeClinic());

    await resetWhatsappPairing("clinic-1");

    expect(createWhatsappInstanceMock).not.toHaveBeenCalled();
    expect(fetchWhatsappQrMock).not.toHaveBeenCalled();
  });

  it("sem instância salva: no-op (nada pra apagar)", async () => {
    clinicFindUniqueOrThrowMock.mockResolvedValue(fakeClinic({ whatsappInstanceName: null }));

    await resetWhatsappPairing("clinic-1");

    expect(deleteWhatsappInstanceMock).not.toHaveBeenCalled();
  });

  // Item "b": delete diz "não existe" (instância fantasma) -> não insiste
  // no mesmo nome, já gera um novo (a partir do SLUG, não do nome antigo)
  // e salva — ainda sem criar/conectar aqui (fica pra próxima carga da
  // tela, igual sempre).
  it('delete diz "não existe" (notFound: true): gera nome novo a partir do slug e salva, ainda sem criar/conectar', async () => {
    clinicFindUniqueOrThrowMock.mockResolvedValue(fakeClinic());
    deleteWhatsappInstanceMock.mockResolvedValue({ notFound: true });

    await resetWhatsappPairing("clinic-1");

    expect(clinicUpdateMock).toHaveBeenCalledTimes(1);
    const data = clinicUpdateMock.mock.calls[0]?.[0]?.data as { whatsappInstanceName: string };
    expect(data.whatsappInstanceName).toMatch(/^clinica-demo-[0-9a-f]{6}$/);
    expect(clinicUpdateMock).toHaveBeenCalledWith({
      where: { id: "clinic-1" },
      data: { whatsappInstanceName: data.whatsappInstanceName, whatsappStatus: null, whatsappStatusCheckedAt: null },
    });
    expect(createWhatsappInstanceMock).not.toHaveBeenCalled();
    expect(fetchWhatsappQrMock).not.toHaveBeenCalled();
  });

  it('delete apaga de verdade (notFound: false): mantém o MESMO nome salvo', async () => {
    clinicFindUniqueOrThrowMock.mockResolvedValue(fakeClinic());
    deleteWhatsappInstanceMock.mockResolvedValue({ notFound: false });

    await resetWhatsappPairing("clinic-1");

    expect(clinicUpdateMock).toHaveBeenCalledWith({
      where: { id: "clinic-1" },
      data: { whatsappStatus: null, whatsappStatusCheckedAt: null },
    });
  });
});

describe("generateFreshWhatsappInstanceName", () => {
  it("slug + sufixo hex curto, compatível com a validação de nome de instância (/^[a-z0-9-]+$/)", () => {
    const name = generateFreshWhatsappInstanceName("clinica-demo");
    expect(name).toMatch(/^clinica-demo-[0-9a-f]{6}$/);
  });

  it("duas chamadas geram nomes diferentes", () => {
    const a = generateFreshWhatsappInstanceName("clinica-demo");
    const b = generateFreshWhatsappInstanceName("clinica-demo");
    expect(a).not.toBe(b);
  });
});

// Item "d" — nunca expõe o corpo bruto da resposta da Evolution, só texto
// em português pronto pro card.
describe("describeWhatsappConnectionError", () => {
  it("EvolutionInstanceNotFoundError: mensagem específica, orienta a reiniciar o pareamento", () => {
    const msg = describeWhatsappConnectionError(new EvolutionInstanceNotFoundError("main"));
    expect(msg).toContain("Reiniciar pareamento");
    expect(msg.toLowerCase()).not.toContain("{");
  });

  it("EvolutionInstanceNameInUseError: mensagem específica", () => {
    const msg = describeWhatsappConnectionError(new EvolutionInstanceNameInUseError("main"));
    expect(msg).toContain("Reiniciar pareamento");
  });

  it("erro genérico (ex.: corpo bruto da Evolution no .message): mensagem fixa, nunca usa err.message", () => {
    const rawError = new Error('{"status":500,"error":"Internal Server Error","response":{"message":["algo quebrou"]}}');
    const msg = describeWhatsappConnectionError(rawError);
    expect(msg).not.toContain("status");
    expect(msg).not.toContain("{");
    expect(msg.toLowerCase()).toContain("evolution");
  });
});

// Item "d" — mensagem de erro clara em vez de ficar eternamente em
// "Conectando…". A Evolution não reporta nenhum estado distinto de
// "falha de pareamento" pro bug atual (companion_reg_refresh) — este é
// um heurístico de tempo decorrido desde que o QR atual apareceu.
describe("isWhatsappPairingStuck", () => {
  it("menos que o limiar: não travado", () => {
    const since = 1_000_000;
    expect(isWhatsappPairingStuck(since, since + WHATSAPP_PAIRING_STUCK_THRESHOLD_MS - 1)).toBe(false);
  });

  it("exatamente no limiar: travado", () => {
    const since = 1_000_000;
    expect(isWhatsappPairingStuck(since, since + WHATSAPP_PAIRING_STUCK_THRESHOLD_MS)).toBe(true);
  });

  it("bem além do limiar: travado", () => {
    const since = 1_000_000;
    expect(isWhatsappPairingStuck(since, since + WHATSAPP_PAIRING_STUCK_THRESHOLD_MS * 5)).toBe(true);
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

  it('"connecting": aparece, rotulado "Reiniciar pareamento"', () => {
    expect(shouldShowWhatsappResetAction("connecting")).toBe(true);
    expect(whatsappResetActionLabel("connecting")).toBe("Reiniciar pareamento");
  });

  // Pedido explícito (item "b"): precisa aparecer em QUALQUER estado
  // diferente de "Conectado" — "close" e "unknown" inclusive, que era
  // exatamente onde o botão sumia no bug real investigado (instância
  // fantasma -> status "desconhecido" -> nenhuma ação possível na tela).
  it('"close": aparece, rotulado "Reiniciar pareamento" (sumia antes deste ajuste)', () => {
    expect(shouldShowWhatsappResetAction("close")).toBe(true);
    expect(whatsappResetActionLabel("close")).toBe("Reiniciar pareamento");
  });

  it('"unknown" (instância fantasma, bug real investigado): aparece, rotulado "Reiniciar pareamento"', () => {
    expect(shouldShowWhatsappResetAction("unknown")).toBe(true);
    expect(whatsappResetActionLabel("unknown")).toBe("Reiniciar pareamento");
  });
});
