import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Rota pública de fallback do cartão de contato da clínica (ver
// Message.clinicContactCard/dispatchOneMessage, dispatch.ts) — redireciona
// pro WhatsApp da clínica sem NUNCA expor o número (ou qualquer outro
// dado da clínica) em texto visível. Mesmo padrão de teste de
// src/app/acesso/[token]/route.test.ts: constrói a NextRequest com um host
// propositalmente diferente de APP_URL pra garantir que o destino nunca
// vem de req.url.
const findUniqueMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { clinic: { findUnique: (...args: unknown[]) => findUniqueMock(...args) } },
}));

const APP_URL = "https://vexo-platform-production.up.railway.app";

describe("GET /c/[id]", () => {
  beforeEach(() => {
    vi.resetModules();
    findUniqueMock.mockReset();
    process.env.APP_URL = APP_URL;
  });

  it("clínica com WhatsApp válido redireciona (302) direto pro wa.me/<dígitos> — nunca o número aparece em outro lugar da resposta", async () => {
    const { GET } = await import("./route");
    findUniqueMock.mockResolvedValue({ clientWhatsappNumber: "+55 (11) 98765-4321" });

    const req = new NextRequest("http://localhost:3000/c/clinic-1");
    const res = await GET(req, { params: { id: "clinic-1" } });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://wa.me/5511987654321");
  });

  it("clínica inexistente redireciona pro login (APP_URL), nunca expõe nenhum dado", async () => {
    const { GET } = await import("./route");
    findUniqueMock.mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/c/clinic-inexistente");
    const res = await GET(req, { params: { id: "clinic-inexistente" } });

    expect(res.headers.get("location")).toBe(`${APP_URL}/login`);
  });

  it("clínica existe mas sem WhatsApp configurado (ou inválido) também redireciona pro login, sem vazar isso", async () => {
    const { GET } = await import("./route");
    findUniqueMock.mockResolvedValue({ clientWhatsappNumber: null });

    const req = new NextRequest("http://localhost:3000/c/clinic-2");
    const res = await GET(req, { params: { id: "clinic-2" } });

    expect(res.headers.get("location")).toBe(`${APP_URL}/login`);
  });

  it("número inválido (sem DDD) também cai no fallback de login, nunca monta um wa.me quebrado", async () => {
    const { GET } = await import("./route");
    findUniqueMock.mockResolvedValue({ clientWhatsappNumber: "987654321" });

    const req = new NextRequest("http://localhost:3000/c/clinic-3");
    const res = await GET(req, { params: { id: "clinic-3" } });

    expect(res.headers.get("location")).toBe(`${APP_URL}/login`);
  });

  it("nunca deriva o destino do host da requisição — só de APP_URL/wa.me", async () => {
    const { GET } = await import("./route");
    findUniqueMock.mockResolvedValue({ clientWhatsappNumber: "11987654321" });

    // Host completamente diferente de APP_URL, propositalmente.
    const req = new NextRequest("http://attacker-controlled-host.example/c/clinic-1");
    const res = await GET(req, { params: { id: "clinic-1" } });

    expect(res.headers.get("location")).not.toContain("attacker-controlled-host");
    expect(res.headers.get("location")).toBe("https://wa.me/5511987654321");
  });
});
