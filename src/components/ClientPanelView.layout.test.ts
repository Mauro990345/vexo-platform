// Reorganização do Painel do cliente (ver docs/design-audit.md, Etapa 4) —
// prova, renderizando a página de verdade (prisma/queries de origem
// mockadas, componentes reais), que a nova estrutura (cabeçalho enxuto,
// faixa de métricas, "Ver semana" sob demanda, 2 colunas) cabe em
// 360/390/414px (celular) e 1366px (computador) sem rolagem horizontal, e
// que a faixa "Para fazer hoje" não tem mais rolagem INTERNA (removido o
// antigo max-h-72 overflow-y-auto) mesmo com muitos cards pendentes.
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium, type Browser } from "playwright";

const PROJECT_ROOT = path.resolve(__dirname, "../..");

const BASE_APPOINTMENT = {
  manualTitle: null as string | null,
  returnPeriodDays: null as number | null,
  leadId: "lead-1",
};

function makeAppointments(now: Date) {
  const inThreeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  // 1 minuto atrás (não "2 horas atrás", pedido original): qualquer
  // subtração de horas arrisca cair no dia civil ANTERIOR em
  // America/Sao_Paulo (UTC-3) quando o teste roda de madrugada em UTC
  // (00h-03h UTC = 21h-24h do dia anterior em BR) — isso mudaria o
  // agrupamento esperado (Aguardando resposta vs Histórico, ver
  // panelAppointmentGroup, panel-appointments.ts). 1 minuto reduz essa
  // janela de risco pra ~1 minuto por dia, sem precisar mockar o relógio
  // global (que quebra o Playwright/child_process deste teste).
  const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  return [
    {
      ...BASE_APPOINTMENT,
      id: "appt-upcoming",
      scheduledAt: inThreeDays,
      status: "SCHEDULED",
      lead: { profilePictureUrl: null, phone: "11999990000", name: "Futura Paciente", igUsername: "futura.ig" },
    },
    {
      // Caso mais apertado de propósito (pedido explícito — conferir se
      // precisa do "Plano B"): Retorno JÁ configurado (120 dias, o rótulo
      // compacto mais largo possível) E Não compareceu, os dois visíveis
      // ao mesmo tempo, com nome+@+telefone também presentes.
      ...BASE_APPOINTMENT,
      id: "appt-awaiting",
      scheduledAt: oneMinuteAgo,
      status: "SCHEDULED",
      returnPeriodDays: 120,
      lead: { profilePictureUrl: null, phone: "11999990001", name: "Aguardando Resposta", igUsername: "aguardando.resposta.ig" },
    },
    {
      ...BASE_APPOINTMENT,
      id: "appt-history",
      scheduledAt: threeDaysAgo,
      status: "NO_SHOW",
      lead: { profilePictureUrl: null, phone: null, name: "Faltou Antiga", igUsername: "faltou.ig" },
    },
  ];
}

function reactivationCardFixture(now: Date, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    appointmentId: `appt-${Math.random()}`,
    leadId: `lead-${Math.random()}`,
    name: "Paciente Pendente",
    igUsername: null,
    profilePictureUrl: null,
    message: "Oi!",
    channel: "WHATSAPP" as const,
    whatsappLink: "https://wa.me/5511999999999",
    instagramDmLink: null,
    instagramProfileLink: null,
    completionDate: now,
    thresholdDays: 30,
    sentAt: null,
    dailyLimitReached: false,
    ...overrides,
  };
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clinic: {
      findUniqueOrThrow: vi.fn(async () => ({
        name: "Clínica Exemplo",
        whatsappStatus: "open",
        instagramAccount: { id: "ig-account-1" },
        googleCalendarAccount: null,
        reactivationConfig: { availablePeriods: [30, 60, 90] },
        fullFaceBonusEnabled: false,
      })),
    },
    appointment: { findMany: vi.fn(async () => makeAppointments(new Date())) },
    conversation: { findMany: vi.fn(async () => []) },
    reactivationCardSlot: { findMany: vi.fn(async () => []) },
  },
}));

vi.mock("@/lib/metrics", async () => {
  const actual = await vi.importActual<typeof import("@/lib/metrics")>("@/lib/metrics");
  return {
    ...actual,
    getClinicMetrics: vi.fn(async () => ({ approached: 42, responded: 18, scheduled: 7 })),
    getAttendanceMetrics: vi.fn(async () => ({ attended: 5, pastDue: 1 })),
    getDailyApproachCounts: vi.fn(async () => [1, 2, 3, 4, 5, 6, 7]),
  };
});

vi.mock("@/lib/reactivation", async () => {
  const actual = await vi.importActual<typeof import("@/lib/reactivation")>("@/lib/reactivation");
  return {
    ...actual,
    getReactivationCards: vi.fn(async (_clinicId: string, now: Date = new Date()) =>
      Array.from({ length: 8 }, (_, i) => reactivationCardFixture(now, { appointmentId: `appt-pending-${i}`, leadId: `lead-pending-${i}`, name: `Paciente ${i + 1}` }))
    ),
    getReactivationReturnStats: vi.fn(async (_clinicId: string, periods: { days: number; label: string }[]) =>
      periods.map((p) => ({ ...p, sent: 0, returned: 0 }))
    ),
  };
});

vi.mock("@/lib/no-show-cards", async () => {
  const actual = await vi.importActual<typeof import("@/lib/no-show-cards")>("@/lib/no-show-cards");
  return { ...actual, getNoShowCards: vi.fn(async () => []) };
});

vi.mock("@/lib/hot-lead-cards", async () => {
  const actual = await vi.importActual<typeof import("@/lib/hot-lead-cards")>("@/lib/hot-lead-cards");
  return { ...actual, getHotLeadCards: vi.fn(async () => []) };
});

vi.mock("@/lib/never-scheduled-cards", async () => {
  const actual = await vi.importActual<typeof import("@/lib/never-scheduled-cards")>("@/lib/never-scheduled-cards");
  return { ...actual, getNeverScheduledCards: vi.fn(async () => []) };
});

const MOBILE_WIDTHS = [360, 390, 414];
const DESKTOP_WIDTH = 1366;

describe("Painel do cliente — layout real da reorganização (Etapa 4 da migração de design)", () => {
  let browser: Browser;
  let compiledCss: string;
  let html: string;

  beforeAll(async () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), "vexo-painel-overflow-"));
    const outCssPath = path.join(tmpDir, "compiled.css");
    execFileSync("npx", ["tailwindcss", "-i", "./src/app/globals.css", "-o", outCssPath, "--minify"], { cwd: PROJECT_ROOT, stdio: "pipe" });
    compiledCss = readFileSync(outCssPath, "utf8");
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

    const { ClientPanelView } = await import("./ClientPanelView");
    const element = await ClientPanelView({ clinicId: "clinic-1", base: "/dashboard" });
    const markup = renderToStaticMarkup(element);
    html = `<!DOCTYPE html><html class="dark"><head><meta charset="utf-8"><style>${compiledCss}</style></head><body class="bg-vexo-bg text-vexo-fg antialiased">${markup}</body></html>`;
  }, 60_000);

  it('sem nenhum card pendente: "Para fazer hoje" mostra "Tudo em dia hoje"', async () => {
    const { getReactivationCards } = await import("@/lib/reactivation");
    vi.mocked(getReactivationCards).mockResolvedValueOnce([]);
    const { ClientPanelView } = await import("./ClientPanelView");
    const element = await ClientPanelView({ clinicId: "clinic-1", base: "/dashboard" });
    const markup = renderToStaticMarkup(element);
    expect(markup).toContain("Para fazer hoje · 0");
    expect(markup).toContain("Tudo em dia hoje");
  });

  afterAll(async () => {
    await browser?.close();
  });

  for (const width of MOBILE_WIDTHS) {
    it(`${width}px: sem rolagem horizontal da página`, async () => {
      const page = await browser.newPage({ viewport: { width, height: 1400 } });
      await page.setContent(html);
      await page.waitForTimeout(50);
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth, `${width}px: scrollWidth (${scrollWidth}) > clientWidth (${clientWidth})`).toBeLessThanOrEqual(clientWidth);
      await page.close();
    });
  }

  it(`${DESKTOP_WIDTH}px (computador): sem rolagem horizontal`, async () => {
    const page = await browser.newPage({ viewport: { width: DESKTOP_WIDTH, height: 1400 } });
    await page.setContent(html);
    await page.waitForTimeout(50);
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    await page.close();
  });

  it('"Para fazer hoje" mostra todos os 8 pendentes, sem nenhum elemento com rolagem interna (removido o antigo max-h-72 overflow-y-auto)', async () => {
    const page = await browser.newPage({ viewport: { width: 1366, height: 1400 } });
    await page.setContent(html);
    await page.waitForTimeout(50);

    const bodyText = await page.locator("body").innerText();
    for (let i = 1; i <= 8; i++) expect(bodyText).toContain(`Paciente ${i}`);

    const overflowAutoCount = await page.locator(".overflow-y-auto").count();
    expect(overflowAutoCount).toBe(0);

    await page.close();
  });

  it('cabeçalho não repete o título "Painel" (removido — enxuto, ver nome da clínica)', async () => {
    const page = await browser.newPage({ viewport: { width: 1366, height: 1400 } });
    await page.setContent(html);
    const h1Count = await page.locator("h1").count();
    expect(h1Count).toBe(0);
    await page.close();
  });

  it('Histórico fica recolhido por padrão (agendamento antigo "Faltou Antiga" não aparece fora dele) e mostra o contador certo', async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 1400 } });
    await page.setContent(html);

    const bodyBefore = await page.locator("body").innerText();
    expect(bodyBefore).not.toContain("Faltou Antiga");
    expect(bodyBefore).toContain("Histórico (1)");
    // Os dois sempre visíveis (Próximos + Aguardando resposta) continuam na tela.
    expect(bodyBefore).toContain("Futura Paciente");
    expect(bodyBefore).toContain("Aguardando Resposta");

    await page.close();
  });

  // Caso mais apertado (item 3 do pedido — conferir se precisa do "Plano
  // B"): agendamento "Aguardando Resposta" com Retorno JÁ configurado
  // (120 dias, o rótulo compacto mais largo) E Não compareceu, os dois
  // visíveis ao mesmo tempo (empilhados, nunca escondidos num menu),
  // junto de nome + @ + telefone. Mede a área de TEXTO de verdade no DOM
  // (não só scrollWidth da página) pra confirmar que não fica espremida a
  // ponto de precisar mover os botões pra uma linha própria. Mesmo caso
  // reaproveitado pro ajuste seguinte (alinhamento vertical do bloco da
  // esquerda + leitura — fonte +1px de data/status/@/telefone): é o pior
  // cenário possível (botões empilhados = item mais alto + os 4 textos
  // maiores ao mesmo tempo), então qualquer quebra feia ou desalinhamento
  // apareceria primeiro aqui.
  for (const width of [...MOBILE_WIDTHS, DESKTOP_WIDTH]) {
    it(`${width}px: linha "Aguardando Resposta" (Retorno · 120 dias + Não compareceu, os dois visíveis) sem espremer o texto`, async () => {
      const page = await browser.newPage({ viewport: { width, height: 1400 } });
      await page.setContent(html);
      await page.waitForTimeout(30);

      const row = page.locator("div.rounded-control.border.bg-vexo-surface", { hasText: "Aguardando Resposta" });
      const rowBox = await row.boundingBox();
      expect(rowBox, `linha não encontrada em ${width}px`).not.toBeNull();

      const nameBox = await row.getByText("Aguardando Resposta", { exact: true }).boundingBox();
      const retornoBox = await row.getByRole("button", { name: "Retorno em 120 dias" }).boundingBox();
      const naoCompareceuBox = await row.getByRole("button", { name: "Não compareceu" }).boundingBox();

      expect(nameBox, "nome não encontrado").not.toBeNull();
      expect(retornoBox, "botão Retorno (120 dias) não encontrado/visível").not.toBeNull();
      expect(naoCompareceuBox, "botão Não compareceu não encontrado/visível").not.toBeNull();

      // Área de texto nunca espremida a ponto de ficar inutilizável —
      // confere que sobrou espaço de verdade pro nome (nenhuma quebra
      // "feia" tipo 1 letra por linha).
      expect(nameBox!.width, `nome com só ${nameBox!.width}px em ${width}px`).toBeGreaterThan(60);
      // Linha inteira sempre dentro do viewport (sem rolagem horizontal
      // localizada nesta linha especificamente).
      expect(rowBox!.x + rowBox!.width).toBeLessThanOrEqual(width + 1);

      // Ajuste de alinhamento (pedido explícito): como os botões
      // empilhados deixam o item mais alto que o bloco da esquerda, o
      // BLOCO de texto (contêiner inteiro, não a 1ª linha de texto nele —
      // line-height/métrica de fonte deixa uma folga que não é o que está
      // sendo medido aqui) e a coluna de botões precisam ficar CENTRADOS
      // na altura do item: o centro vertical de cada contêiner deve
      // coincidir com o centro vertical da linha inteira.
      const textBlockBox = await row.locator("div.min-w-0.flex-1").boundingBox();
      const actionsColBox = await row.locator("div.flex.shrink-0.flex-col").boundingBox();
      expect(textBlockBox, "bloco de texto não encontrado").not.toBeNull();
      expect(actionsColBox, "coluna de botões não encontrada").not.toBeNull();

      const rowMidY = rowBox!.y + rowBox!.height / 2;
      const textMidY = textBlockBox!.y + textBlockBox!.height / 2;
      const actionsMidY = actionsColBox!.y + actionsColBox!.height / 2;
      expect(Math.abs(textMidY - rowMidY), `centro do texto a ${Math.abs(textMidY - rowMidY)}px do centro da linha, em ${width}px`).toBeLessThan(1);
      expect(Math.abs(actionsMidY - rowMidY), `centro dos botões a ${Math.abs(actionsMidY - rowMidY)}px do centro da linha, em ${width}px`).toBeLessThan(1);

      // @ do Instagram e telefone não quebram de forma feia (linha "oca",
      // de 1 letra) com a fonte maior — cada um mede o bastante pra não
      // ser só um caractere solto numa linha própria.
      const handleBox = await row.getByText("@aguardando.resposta.ig", { exact: true }).boundingBox();
      const phoneBox = await row.getByText("11999990001", { exact: true }).boundingBox();
      expect(handleBox, "@ não encontrado").not.toBeNull();
      expect(phoneBox, "telefone não encontrado").not.toBeNull();
      expect(handleBox!.width, `@ com só ${handleBox!.width}px em ${width}px`).toBeGreaterThan(40);
      expect(phoneBox!.width, `telefone com só ${phoneBox!.width}px em ${width}px`).toBeGreaterThan(60);

      await page.close();
    });
  }
});
