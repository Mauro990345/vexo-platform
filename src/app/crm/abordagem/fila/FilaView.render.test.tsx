import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ClinicQueueCard } from "./FilaView";
import type { ApproachAccountState } from "@/lib/approach-queue";
import type { ApproachBoardAccount } from "@/lib/approach-queue-db";

// Render puro (sem interação, mesmo padrão de Button.test.tsx/Card.test.tsx)
// — cobre o card de UMA clínica no novo layout de 3 cards simultâneos (ver
// DESIGN.md "Fila de abordagem — rodada 6"): @ do Instagram CONECTADO
// desta clínica, nome da clínica, @ do lead (com nome só se houver) e o
// botão conforme o estado da conta.

const NOW = 1_000_000;

function account(state: ApproachAccountState, overrides: Partial<ApproachBoardAccount> = {}): ApproachBoardAccount {
  return {
    clinicId: "clinic-1",
    name: "Clínica Demo",
    igUsername: "clinica.demo",
    profilePictureUrl: null,
    dailyLimit: 60,
    sentToday: 3,
    leadsRemaining: 320,
    state,
    items: [{ id: "item-1", username: "fulano.ig", name: null, message: "Oi!", dmLink: "https://ig.me/m/fulano.ig" }],
    ...overrides,
  };
}

function render(acc: ApproachBoardAccount, fetchedAt = NOW, hideConnectedHandle = false) {
  return renderToStaticMarkup(
    <ClinicQueueCard
      account={acc}
      now={NOW}
      fetchedAt={fetchedAt}
      sendingItemId={null}
      onSend={() => {}}
      onSkip={() => {}}
      onUndo={() => {}}
      onPauseToggle={() => {}}
      hideConnectedHandle={hideConnectedHandle}
    />
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

  it("liberada (READY): botão azul 'Enviar'", () => {
    const markup = render(account({ kind: "READY" }));
    expect(markup).toContain(">Enviar<");
    expect(markup).not.toContain("Enviar mensagem");
  });

  it("em espera (WAITING): botão desativado com contagem e 'Não enviei · Desfazer' junto dos outros links", () => {
    const markup = render(account({ kind: "WAITING", msRemaining: 72_000 }));
    expect(markup).toContain("Aguarde");
    expect(markup).toContain("Não enviei · Desfazer");
    expect(markup).not.toContain(">Enviar<");
  });

  it("pausa de lote (BATCH_PAUSED): botão cinza com contagem em horas, SEM o link de desfazer", () => {
    const markup = render(account({ kind: "BATCH_PAUSED", msRemaining: 2 * 3600_000 }));
    expect(markup).toContain("Pausa 2:00:00");
    expect(markup).not.toContain("Não enviei · Desfazer");
    expect(markup).not.toContain(">Enviar<");
  });

  it("limite do dia atingido: botão cinza com o motivo", () => {
    const markup = render(account({ kind: "LIMIT_REACHED" }));
    expect(markup).toContain("Limite de hoje");
  });

  it("pausada manualmente: botão cinza 'Pausada' e link 'Retomar conta' em vez de 'Pausar conta'", () => {
    const markup = render(account({ kind: "PAUSED" }));
    expect(markup).toContain("Pausada");
    expect(markup).toContain("Retomar conta");
    expect(markup).not.toContain("Pausar conta");
  });

  it("não pausada: mostra o link 'Pausar conta'", () => {
    const markup = render(account({ kind: "READY" }));
    expect(markup).toContain("Pausar conta");
  });

  it("sempre mostra o link 'Pular', qualquer que seja o estado", () => {
    expect(render(account({ kind: "READY" }))).toContain("Pular");
    expect(render(account({ kind: "WAITING", msRemaining: 1000 }))).toContain("Pular");
    expect(render(account({ kind: "LIMIT_REACHED" }))).toContain("Pular");
  });

  it("espera já vencida (countdown zerado localmente) — botão volta a ficar liberado", () => {
    const markup = render(account({ kind: "WAITING", msRemaining: 1000 }), NOW - 5000);
    expect(markup).toContain(">Enviar<");
  });

  it("sem lead ativo (items vazio) — não renderiza nada", () => {
    const markup = render(account({ kind: "READY" }, { items: [] }));
    expect(markup).toBe("");
  });

  it("nome da clínica e @ longos usam truncate (uma linha só, nunca empurra o botão)", () => {
    const markup = render(account({ kind: "READY" }, { name: "Clínica Com Um Nome Bem Longo Que Não Caberia Numa Linha" }));
    expect(markup).toMatch(/class="truncate[^"]*">· Clínica Com Um Nome Bem Longo Que Não Caberia Numa Linha</);
  });

  // Pedido explícito: o @ do Instagram CONECTADO desta clínica (não o @ do
  // lead) precisa aparecer bem visível, na mesma linha do nome da clínica
  // — PRIMEIRO elemento da linha, então antes do nome da clínica E do
  // nome/@ do lead (ver os testes acima, que continuam passando: o @ do
  // lead continua só nas linhas de baixo).
  it("mostra o @ do Instagram conectado da clínica, em destaque, ANTES do nome dela", () => {
    const markup = render(account({ kind: "READY" }, { igUsername: "clinica.demo" }));
    expect(markup).toMatch(/@clinica\.demo.*· Clínica Demo/s);
    expect(markup).toContain('<span class="shrink-0 font-semibold">@clinica.demo</span>');
  });

  it("clínica sem Instagram conectado: mostra o aviso em vez de um @ inventado", () => {
    const markup = render(account({ kind: "READY" }, { igUsername: null }));
    expect(markup).toContain("Instagram não conectado");
    expect(markup).not.toContain("@null");
  });

  // hideConnectedHandle (pedido explícito, ClinicFilaView.tsx — o @
  // conectado sobe pro topo da PÁGINA só nessa tela por clínica): a Fila
  // GLOBAL nunca passa isso (default false, já coberto nos testes acima);
  // quando passado, o card volta pro texto simples de sempre (nome da
  // clínica + contador), sem repetir o @ que já está na página.
  it("hideConnectedHandle=true: NUNCA mostra o @ conectado dentro do card (ele já está no topo da página)", () => {
    const markup = render(account({ kind: "READY" }, { igUsername: "clinica.demo" }), NOW, true);
    expect(markup).not.toContain("clinica.demo");
    expect(markup).toContain("Clínica Demo");
    expect(markup).toContain("· 320");
  });

  it("botão liberado tem área de toque ampliada (pelo menos 44px), sem mudar o desenho visual", () => {
    const markup = render(account({ kind: "READY" }));
    expect(markup).toContain("before:min-h-11");
  });

  it("botão compacto (sem largura mínima) — cresce só na largura quando o texto precisa, nunca na altura", () => {
    const ready = render(account({ kind: "READY" }));
    const readyButton = ready.match(/<button[^>]*>Enviar<\/button>/)?.[0] ?? "";
    expect(readyButton).not.toContain("min-w-");
    expect(readyButton).toContain("px-5");
    const disabledButton = render(account({ kind: "OUTSIDE_HOURS" })).match(/<button[^>]*disabled[^>]*>/)?.[0] ?? "";
    expect(disabledButton).not.toContain("min-w-");
  });

  it("mostra o número de leads restantes logo depois do nome da clínica, em cinza claro, sem cor de aviso", () => {
    const markup = render(account({ kind: "READY" }, { leadsRemaining: 320 }));
    expect(markup).toMatch(/Clínica Demo.*· 320/s);
    expect(markup).toContain("text-vexo-mutedLight");
  });
});
