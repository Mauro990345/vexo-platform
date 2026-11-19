import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import path from "node:path";
import { isReviewerAllowedPath } from "./reviewer-access";
import { DEMO_CLINIC_ID } from "./demo-clinic";

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const OTHER_CLINIC_ID = "other-clinic-nao-e-a-demo";
const SAMPLE_ID = "sample-id-123";

// Lista FIXA (negar por padrão) — ver reviewer-access.ts. Qualquer página/
// rota de src/app/crm ou src/app/api que NÃO esteja aqui precisa ser
// negada pro Revisor; este teste varre o sistema de arquivos de verdade
// (não uma lista escrita à mão) pra pegar rota nova criada no futuro sem
// precisar lembrar de atualizar este teste.
const ALLOWED_PATTERNS = new Set([
  "/crm/clinicas/[id]",
  "/crm/clinicas/[id]/conexoes",
  "/crm/clinicas/[id]/painel",
  "/crm/conversas/[id]",
  "/api/conversas/[id]/mensagens",
  "/api/clinicas/[id]/pipeline",
]);

// Converte caminho de arquivo (já sem "src/app" nem o nome do arquivo) em
// padrão de rota — remove segmentos de route group ("(global)"), que não
// aparecem na URL de verdade.
function toRoutePattern(relativeDir: string): string {
  const segments = relativeDir.split("/").filter((seg) => !(seg.startsWith("(") && seg.endsWith(")")));
  return `/${segments.join("/")}`;
}

// Varre o sistema de arquivos de verdade (sem depender de nenhuma lib de
// glob — este repo não tem uma como dependência direta) atrás de
// `fileName` (page.tsx ou route.ts) dentro de `startDir`, devolvendo o
// padrão de rota (sem "src/app", sem o nome do arquivo, sem route groups)
// de cada um encontrado.
function discoverRoutePatterns(startDir: string, fileName: string): string[] {
  const patterns: string[] = [];

  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name === fileName) {
        const relDir = path.relative(path.join(PROJECT_ROOT, "src/app"), path.dirname(full));
        patterns.push(toRoutePattern(relDir.split(path.sep).join("/")));
      }
    }
  }

  walk(path.join(PROJECT_ROOT, startDir));
  return patterns;
}

// Troca cada segmento dinâmico ([id], [clinicId], [...nextauth]) por um
// valor de exemplo — clinicId por DEMO_CLINIC_ID (clínica do Revisor) ou
// por outra clínica, conforme o teste.
function fillDynamicSegments(pattern: string, idValue: string): string {
  return pattern
    .split("/")
    .map((seg) => {
      if (seg.startsWith("[...") && seg.endsWith("]")) return SAMPLE_ID;
      if (seg.startsWith("[") && seg.endsWith("]")) return idValue;
      return seg;
    })
    .join("/");
}

describe("reviewer-access — varredura de TODAS as páginas/rotas existentes", () => {
  const crmPatterns = discoverRoutePatterns("src/app/crm", "page.tsx");
  const apiPatterns = discoverRoutePatterns("src/app/api", "route.ts");
  const allPatterns = [...new Set([...crmPatterns, ...apiPatterns])];

  it("encontrou páginas/rotas de verdade (a varredura não está vazia)", () => {
    expect(crmPatterns.length).toBeGreaterThan(5);
    expect(apiPatterns.length).toBeGreaterThan(3);
  });

  it("toda rota da lista liberada corresponde a um arquivo que existe de verdade", () => {
    for (const allowed of ALLOWED_PATTERNS) {
      expect(allPatterns, `"${allowed}" não bate com nenhum arquivo real encontrado`).toContain(allowed);
    }
  });

  for (const pattern of allPatterns) {
    const expectedAllowed = ALLOWED_PATTERNS.has(pattern);
    const pathname = fillDynamicSegments(pattern, DEMO_CLINIC_ID);

    it(`${pattern} (clínica do Revisor): ${expectedAllowed ? "LIBERADA" : "negada (não está na lista)"}`, () => {
      expect(isReviewerAllowedPath(pathname, DEMO_CLINIC_ID)).toBe(expectedAllowed);
    });
  }

  // Rotas com :id (clinicas/[id], clinicas/[id]/conexoes, clinicas/[id]/painel)
  // só valem pra PRÓPRIA clínica do Revisor — de outra clínica, negadas
  // mesmo sendo o mesmo tipo de página.
  it("clinicas/[id], /conexoes, /painel e a API do pipeline de OUTRA clínica são negados", () => {
    expect(isReviewerAllowedPath(`/crm/clinicas/${OTHER_CLINIC_ID}`, DEMO_CLINIC_ID)).toBe(false);
    expect(isReviewerAllowedPath(`/crm/clinicas/${OTHER_CLINIC_ID}/conexoes`, DEMO_CLINIC_ID)).toBe(false);
    expect(isReviewerAllowedPath(`/crm/clinicas/${OTHER_CLINIC_ID}/painel`, DEMO_CLINIC_ID)).toBe(false);
    expect(isReviewerAllowedPath(`/api/clinicas/${OTHER_CLINIC_ID}/pipeline`, DEMO_CLINIC_ID)).toBe(false);
  });

  it("sem clinicId (usuário sem clínica associada) nunca libera nada", () => {
    expect(isReviewerAllowedPath(`/crm/clinicas/${DEMO_CLINIC_ID}/conexoes`, "")).toBe(false);
  });

  it("conversas e a rota de mensagens aceitam qualquer :id (dono real é checado na própria página/rota)", () => {
    expect(isReviewerAllowedPath("/crm/conversas/qualquer-coisa", DEMO_CLINIC_ID)).toBe(true);
    expect(isReviewerAllowedPath("/api/conversas/qualquer-coisa/mensagens", DEMO_CLINIC_ID)).toBe(true);
  });

  it("nunca libera sub-rotas que não existem na lista (ex: whatsapp, status, automacoes)", () => {
    const base = `/crm/clinicas/${DEMO_CLINIC_ID}`;
    for (const sub of ["whatsapp", "status", "automacoes", "agente-ia", "follow-up", "bonus", "briefing", "configuracoes", "relatorio-preview"]) {
      expect(isReviewerAllowedPath(`${base}/${sub}`, DEMO_CLINIC_ID)).toBe(false);
    }
  });

  it("nunca libera nada da visão global (Contas, Painel geral, Fila de abordagem, Buscar seguidores)", () => {
    for (const p of ["/crm", "/crm/painel", "/crm/follow-up", "/crm/abordagem", "/crm/abordagem/fila", "/crm/abordagem/seguidores", "/crm/dispatch-status", "/crm/webhook-logs"]) {
      expect(isReviewerAllowedPath(p, DEMO_CLINIC_ID)).toBe(false);
    }
  });
});
