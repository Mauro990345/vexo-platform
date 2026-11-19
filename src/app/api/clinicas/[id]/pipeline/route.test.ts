// Busca leve usada pelo polling do Pipeline (PipelineBoard, a cada 3-4s) —
// prova que exige login, que o Revisor só recebe dados da PRÓPRIA clínica
// (nunca de outra, 404 sem revelar nada) e que Admin/Equipe continuam
// acessando qualquer clínica como sempre.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getServerSessionMock = vi.fn(async (): Promise<unknown> => null);
vi.mock("next-auth", () => ({ getServerSession: () => getServerSessionMock() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const getPipelineSnapshotMock = vi.fn(async (_clinicId: string) => ({
  conversations: [],
  metrics: { newContacts: 0, responded: 0, scheduled: 0, completed: 0, noShow: 0 },
}));
vi.mock("@/lib/pipeline-data", () => ({
  getPipelineSnapshot: (clinicId: string) => getPipelineSnapshotMock(clinicId),
}));

const { GET } = await import("./route");

function req(clinicId: string): NextRequest {
  return new NextRequest(new URL(`https://app.vexoia.com.br/api/clinicas/${clinicId}/pipeline`));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/clinicas/[id]/pipeline", () => {
  it("sem sessão: 401, nunca consulta o banco", async () => {
    getServerSessionMock.mockResolvedValue(null);
    const res = await GET(req("clinic-1"), { params: { id: "clinic-1" } });
    expect(res.status).toBe(401);
    expect(getPipelineSnapshotMock).not.toHaveBeenCalled();
  });

  it("CLIENT: 401 (esta rota é só pro CRM interno/Revisor)", async () => {
    getServerSessionMock.mockResolvedValue({ user: { role: "CLIENT", clinicId: "clinic-1" } });
    const res = await GET(req("clinic-1"), { params: { id: "clinic-1" } });
    expect(res.status).toBe(401);
    expect(getPipelineSnapshotMock).not.toHaveBeenCalled();
  });

  it("INTERNAL_ADMIN: acessa qualquer clínica normalmente", async () => {
    getServerSessionMock.mockResolvedValue({ user: { role: "INTERNAL_ADMIN" } });
    const res = await GET(req("clinic-qualquer"), { params: { id: "clinic-qualquer" } });
    expect(res.status).toBe(200);
    expect(getPipelineSnapshotMock).toHaveBeenCalledWith("clinic-qualquer");
  });

  it("INTERNAL_STAFF: acessa qualquer clínica normalmente", async () => {
    getServerSessionMock.mockResolvedValue({ user: { role: "INTERNAL_STAFF" } });
    const res = await GET(req("clinic-qualquer"), { params: { id: "clinic-qualquer" } });
    expect(res.status).toBe(200);
    expect(getPipelineSnapshotMock).toHaveBeenCalledWith("clinic-qualquer");
  });

  it("REVIEWER da PRÓPRIA clínica: 200, recebe o retrato", async () => {
    getServerSessionMock.mockResolvedValue({ user: { role: "REVIEWER", clinicId: "demo-1" } });
    const res = await GET(req("demo-1"), { params: { id: "demo-1" } });
    expect(res.status).toBe(200);
    expect(getPipelineSnapshotMock).toHaveBeenCalledWith("demo-1");
  });

  it("REVIEWER de OUTRA clínica: 404, nunca consulta o banco (não revela nada)", async () => {
    getServerSessionMock.mockResolvedValue({ user: { role: "REVIEWER", clinicId: "demo-1" } });
    const res = await GET(req("outra-clinica"), { params: { id: "outra-clinica" } });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: "not_found" });
    expect(getPipelineSnapshotMock).not.toHaveBeenCalled();
  });
});
