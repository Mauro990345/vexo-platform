// Requisito 7 (App Review da Meta): Painel sob o login Revisor — somente
// leitura (readOnly, ver clinicas/[id]/painel/page.tsx) esconde todos os
// botões de ação (Retorno, Não compareceu, Enviar, Marcar como enviado
// etc.) e não introduz rolagem horizontal, nas 2 larguras pedidas (390px
// celular, 1366px notebook). Mesmo fixture/mock de
// ClientPanelView.layout.test.ts (cards pendentes garantidos pra provar
// que SEM eles aparecerem os botões continuam escondidos, não só ausentes
// por falta de dado).
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
  const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
  return [
    {
      ...BASE_APPOINTMENT,
      id: "appt-awaiting",
      scheduledAt: oneMinuteAgo,
      status: "SCHEDULED",
      returnPeriodDays: 120,
      lead: { profilePictureUrl: null, phone: "11999990001", name: "Aguardando Resposta", igUsername: "aguardando.resposta.ig" },
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
        name: "Clínica Demo VEXO",
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
    getReactivationCards: vi.fn(async (_clinicId: string, now: Date = new Date()) => [
      reactivationCardFixture(now, { appointmentId: "appt-pending-1", leadId: "lead-pending-1", name: "Paciente Pendente 1" }),
    ]),
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

const MOBILE_WIDTH = 390;
const DESKTOP_WIDTH = 1366;

describe("Painel — Revisor (somente leitura, readOnly=true)", () => {
  let browser: Browser;
  let compiledCss: string;
  let html: string;

  beforeAll(async () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), "vexo-painel-revisor-"));
    const outCssPath = path.join(tmpDir, "compiled.css");
    execFileSync("npx", ["tailwindcss", "-i", "./src/app/globals.css", "-o", outCssPath, "--minify"], { cwd: PROJECT_ROOT, stdio: "pipe" });
    compiledCss = readFileSync(outCssPath, "utf8");
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

    const { ClientPanelView } = await import("./ClientPanelView");
    const element = await ClientPanelView({ clinicId: "clinic-1", base: "/crm/clinicas/clinic-1/painel", readOnly: true });
    const markup = renderToStaticMarkup(element);
    html = `<!DOCTYPE html><html class="dark"><head><meta charset="utf-8"><style>${compiledCss}</style></head><body class="bg-vexo-bg text-vexo-fg antialiased"><main class="px-4 py-6 sm:px-8 sm:py-8"><div class="mx-auto max-w-6xl">${markup}</div></main></body></html>`;
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
  });

  for (const width of [MOBILE_WIDTH, DESKTOP_WIDTH]) {
    it(`${width}px: sem rolagem horizontal da página`, async () => {
      const page = await browser.newPage({ viewport: { width, height: 1400 } });
      await page.setContent(html);
      await page.waitForTimeout(30);
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth, `${width}px: scrollWidth (${scrollWidth}) > clientWidth (${clientWidth})`).toBeLessThanOrEqual(clientWidth);
      await page.close();
    });

    it(`${width}px: nenhum botão de ação aparece (Retorno/Não compareceu/Enviar/Marcar)`, async () => {
      const page = await browser.newPage({ viewport: { width, height: 1400 } });
      await page.setContent(html);
      await page.waitForTimeout(30);
      const bodyText = await page.evaluate(() => document.body.innerText);
      for (const forbidden of ["Retorno em", "Não compareceu", "Marcar como enviado", "Enviar mensagem"]) {
        expect(bodyText, `texto proibido "${forbidden}" apareceu na tela do Revisor`).not.toContain(forbidden);
      }
      await page.close();
    });
  }

  it("não mostra o botão/modal de acesso do cliente (headerAction omitido pro Revisor)", () => {
    expect(html).not.toContain("Criar painel");
    expect(html).not.toContain("Acesso do cliente");
  });
});
