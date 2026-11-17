import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ClinicQueueCard } from "./FilaView";
import type { ApproachAccountState } from "@/lib/approach-queue";
import type { ApproachBoardAccount } from "@/lib/approach-queue-db";

// Render puro (sem interação, mesmo padrão de Button.test.tsx/Card.test.tsx)
// — cobre o card de UMA clínica no novo layout de 3 cards simultâneos (ver
// DESIGN.md "Fila de abordagem — rodada 6"): nome da clínica, @ do lead
// (com nome só se houver) e o botão conforme o estado da conta.

const NOW = 1_000_000;

function account(state: ApproachAccountState, overrides: Partial<ApproachBoardAccount> = {}): ApproachBoardAccount {
  return {
    clinicId: "clinic-1",
    name: "Clínica Demo",
    igUsername: "clinica.demo",
    profilePictureUrl: null,
    dailyLimit: 60,
    sentToday: 3,
    state,
    items: [{ id: "item-1", username: "fulano.ig", name: null, message: "Oi!", dmLink: "https://ig.me/m/fulano.ig" }],
    ...overrides,
  };
}

function render(acc: ApproachBoardAccount, fetchedAt = NOW) {
  return renderToStaticMarkup(
    <ClinicQueueCard account={acc} now={NOW} fetchedAt={fetchedAt} sendingItemId={null} onSend={() => {}} onSkip={() => {}} onUndo={() => {}} onPauseToggle={() => {}} />
  );
}

describe("ClinicQueueCard", () => {
  it("lead sem nome: mostra só o @ em destaque, UMA vez só (nunca repetido numa 2ª linha)", () => {
    const markup = render(account({ kind: "READY" }));
    const occurrences = markup.split("fulano.ig").length - 1;
    expect(occurrences).toBe(1);
    expect(markup).toContain("@fulano.ig");
  });

  it("lead com nome: mostra o primeiro nome E o @ (2 informações, não duplicadas)", () => {
    const markup = render(
      account({ kind: "READY" }, { items: [{ id: "item-1", username: "maria.ig", name: "Maria Clara", message: "Oi!", dmLink: "https://ig.me/m/maria.ig" }] })
    );
    expect(markup).toContain("Maria");
    expect(markup).not.toContain("Clara"); // só o primeiro nome
    expect(markup).toContain("@maria.ig");
  });

  it("liberada (READY): botão azul 'Enviar mensagem'", () => {
    const markup = render(account({ kind: "READY" }));
    expect(markup).toContain("Enviar mensagem");
  });

  it("em espera (WAITING): botão desativado com contagem e 'Não enviei · Desfazer' embaixo", () => {
    const markup = render(account({ kind: "WAITING", msRemaining: 72_000 }));
    expect(markup).toContain("Aguarde");
    expect(markup).toContain("Não enviei · Desfazer");
    expect(markup).not.toContain("Enviar mensagem");
  });

  it("pausa de lote (BATCH_PAUSED): botão cinza com contagem em horas, SEM o link de desfazer", () => {
    const markup = render(account({ kind: "BATCH_PAUSED", msRemaining: 2 * 3600_000 }));
    expect(markup).toContain("Pausa 2:00:00");
    expect(markup).not.toContain("Não enviei · Desfazer");
    expect(markup).not.toContain("Enviar mensagem");
  });

  it("limite do dia atingido: botão cinza com o motivo", () => {
    const markup = render(account({ kind: "LIMIT_REACHED" }));
    expect(markup).toContain("Limite de hoje");
  });

  it("pausada manualmente: botão cinza 'Pausada' e link 'Retomar conta' em vez de 'Pausar esta conta'", () => {
    const markup = render(account({ kind: "PAUSED" }));
    expect(markup).toContain("Pausada");
    expect(markup).toContain("Retomar conta");
    expect(markup).not.toContain("Pausar esta conta");
  });

  it("não pausada: mostra o link 'Pausar esta conta'", () => {
    const markup = render(account({ kind: "READY" }));
    expect(markup).toContain("Pausar esta conta");
  });

  it("sempre mostra o link 'Pular', qualquer que seja o estado", () => {
    expect(render(account({ kind: "READY" }))).toContain("Pular");
    expect(render(account({ kind: "WAITING", msRemaining: 1000 }))).toContain("Pular");
    expect(render(account({ kind: "LIMIT_REACHED" }))).toContain("Pular");
  });

  it("espera já vencida (countdown zerado localmente) — botão volta a ficar liberado", () => {
    const markup = render(account({ kind: "WAITING", msRemaining: 1000 }), NOW - 5000);
    expect(markup).toContain("Enviar mensagem");
  });

  it("sem lead ativo (items vazio) — não renderiza nada", () => {
    const markup = render(account({ kind: "READY" }, { items: [] }));
    expect(markup).toBe("");
  });
});
