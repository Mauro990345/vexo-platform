import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ClinicFilaView } from "./ClinicFilaView";
import type { ApproachBoardAccount } from "@/lib/approach-queue-db";

// Render puro (mesmo padrão de FilaView.render.test.tsx) — a Fila de UMA
// clínica só, sem o toggle "ativa na fila" (ver page.test.ts/actions.test.ts
// pra prova de que o servidor ignora esse campo aqui).
const ALWAYS_OPEN_WINDOW = { startMinute: 0, endMinute: 23 * 60 + 59 };

function account(overrides: Partial<ApproachBoardAccount> = {}): ApproachBoardAccount {
  return {
    clinicId: "clinic-1",
    name: "Clínica Demo",
    igUsername: "clinica.demo",
    profilePictureUrl: null,
    dailyLimit: 60,
    sentToday: 3,
    leadsRemaining: 1,
    state: { kind: "READY" },
    items: [{ id: "item-1", username: "fulano.ig", name: null, message: "Oi!", dmLink: "https://ig.me/m/fulano.ig" }],
    ...overrides,
  };
}

describe("ClinicFilaView", () => {
  it("mostra o card desta clínica, com o @ do Instagram conectado e o nome da clínica no texto de apoio", () => {
    const markup = renderToStaticMarkup(
      <ClinicFilaView clinicId="clinic-1" clinicName="Clínica Demo" initialAccount={account()} initialWindow={ALWAYS_OPEN_WINDOW} />
    );
    expect(markup).toContain("@clinica.demo");
    expect(markup).toContain("Clínica Demo");
    expect(markup).toContain(">Enviar<");
  });

  it("sem lead ativo (items vazio): mostra o aviso, não um card vazio", () => {
    const markup = renderToStaticMarkup(
      <ClinicFilaView clinicId="clinic-1" clinicName="Clínica Demo" initialAccount={account({ items: [] })} initialWindow={ALWAYS_OPEN_WINDOW} />
    );
    expect(markup).toContain("Nenhum lead pronto pra abordar agora.");
    expect(markup).not.toContain("data-clinic-queue-card");
  });

  it("fora do horário permitido: mostra o aviso de horário, não o card", () => {
    const markup = renderToStaticMarkup(
      <ClinicFilaView clinicId="clinic-1" clinicName="Clínica Demo" initialAccount={account()} initialWindow={{ startMinute: 0, endMinute: 1 }} />
    );
    expect(markup).toContain("Fora do horário");
    expect(markup).not.toContain("data-clinic-queue-card");
  });

  it("mostra um link de volta pra Fila global (todas as clínicas)", () => {
    const markup = renderToStaticMarkup(
      <ClinicFilaView clinicId="clinic-1" clinicName="Clínica Demo" initialAccount={account()} initialWindow={ALWAYS_OPEN_WINDOW} />
    );
    expect(markup).toContain('href="/crm/abordagem/fila"');
  });
});
