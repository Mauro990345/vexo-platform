import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ClinicFilaView } from "./ClinicFilaView";
import type { ApproachBoardAccount, ApproachBoardItem } from "@/lib/approach-queue-db";

// Render puro (mesmo padrão de FilaView.render.test.tsx) — a Fila de UMA
// clínica só, sem o toggle "ativa na fila" (ver page.test.ts/actions.test.ts
// pra prova de que o servidor ignora esse campo aqui).
const ALWAYS_OPEN_WINDOW = { startMinute: 0, endMinute: 23 * 60 + 59 };

function item(overrides: Partial<ApproachBoardItem> = {}): ApproachBoardItem {
  return { id: "item-1", username: "fulano.ig", name: null, message: "Oi!", dmLink: "https://ig.me/m/fulano.ig", ...overrides };
}

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
    items: [item()],
    ...overrides,
  };
}

function render(overrides: Partial<ApproachBoardAccount> = {}) {
  return renderToStaticMarkup(
    <ClinicFilaView clinicId="clinic-1" clinicName="Clínica Demo" initialAccount={account(overrides)} initialWindow={ALWAYS_OPEN_WINDOW} />
  );
}

describe("ClinicFilaView — @ do Instagram conectado no topo da página", () => {
  it("mostra o username conectado ao lado do título 'Abordagem', SEM '@' na frente", () => {
    const markup = render();
    expect(markup).toContain(">Abordagem</h1>");
    expect(markup).toContain(">clinica.demo</span>");
    expect(markup).not.toContain("@clinica.demo");
  });

  it("sem Instagram conectado: mostra o aviso, não um username vazio/null", () => {
    const markup = render({ igUsername: null });
    expect(markup).toContain("Instagram não conectado");
  });

  it("o card ativo NÃO repete o @ conectado (hideConnectedHandle) — só o nome da clínica e o contador", () => {
    const markup = render();
    // "clinica.demo" aparece só UMA vez (no topo da página) — o card não duplica.
    expect(markup.split("clinica.demo").length - 1).toBe(1);
    expect(markup).toContain("Clínica Demo");
    expect(markup).toContain(">Enviar<");
  });
});

describe("ClinicFilaView — leads empilhados atrás do ativo", () => {
  it("mostra os itens 1..N como prévia esmaecida, com nome/@ e uma estimativa — nunca um botão clicável", () => {
    const markup = render({
      items: [
        item({ id: "item-1", username: "um.ig", name: "Ana Clara" }),
        item({ id: "item-2", username: "dois.ig", name: null, estimatedMsRemaining: 80_000 }),
        item({ id: "item-3", username: "tres.ig", name: "Bruno", estimatedMsRemaining: 180_000 }),
      ],
    });
    expect(markup).toContain("@dois.ig");
    expect(markup).toContain("Bruno · @tres.ig");
    expect(markup).toContain("1min 20s");
    expect(markup).toContain("3min 00s");
    // Só 1 botão "Enviar" no total — os itens empilhados não têm botão algum.
    expect(markup.split(">Enviar<").length - 1).toBe(1);
  });

  it("só 1 item na fila (sem nada empilhado atrás): não mostra nenhuma prévia", () => {
    const markup = render({ items: [item()] });
    expect(markup).not.toContain("opacity-50");
  });
});

describe("ClinicFilaView — estados", () => {
  it("sem lead ativo (items vazio): mostra o aviso, não um card vazio", () => {
    const markup = render({ items: [] });
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
    const markup = render();
    expect(markup).toContain('href="/crm/abordagem/fila"');
  });
});
