import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LeadCard } from "./FilaView";

// Render puro (sem interação, mesmo padrão de Button.test.tsx/Card.test.tsx)
// — cobre os dois bugs relatados: card truncado (deve aparecer um por lead
// até 3) e o @ duplicado quando o lead não tem nome.

describe("LeadCard", () => {
  it("sem nome: mostra só o @ em destaque, UMA vez só (nunca repetido numa 2ª linha)", () => {
    const markup = renderToStaticMarkup(
      <LeadCard item={{ name: null, username: "fulano.ig" }} active ready waiting={false} countdown="0:00" onSend={() => {}} onSkip={() => {}} />
    );
    const occurrences = markup.split("fulano.ig").length - 1;
    expect(occurrences).toBe(1);
    expect(markup).toContain("@fulano.ig");
  });

  it("com nome: mostra o primeiro nome em destaque E o @ embaixo (2 informações, não duplicadas)", () => {
    const markup = renderToStaticMarkup(
      <LeadCard item={{ name: "Maria Clara", username: "maria.ig" }} active ready waiting={false} countdown="0:00" onSend={() => {}} onSkip={() => {}} />
    );
    expect(markup).toContain("Maria");
    expect(markup).not.toContain("Clara"); // só o primeiro nome
    expect(markup).toContain("@maria.ig");
  });

  it("card inativo (esmaecido) sem nome: também só o @, sem repetir", () => {
    const markup = renderToStaticMarkup(
      <LeadCard item={{ name: null, username: "ciclana.ig" }} active={false} ready={false} waiting={false} countdown="0:00" onSend={() => {}} onSkip={() => {}} />
    );
    const occurrences = markup.split("ciclana.ig").length - 1;
    expect(occurrences).toBe(1);
  });

  it("card inativo com nome: nome + @ (sem botão)", () => {
    const markup = renderToStaticMarkup(
      <LeadCard
        item={{ name: "Beltrano Souza", username: "beltrano.ig" }}
        active={false}
        ready={false}
        waiting={false}
        countdown="0:00"
        onSend={() => {}}
        onSkip={() => {}}
      />
    );
    expect(markup).toContain("Beltrano Souza");
    expect(markup).toContain("@beltrano.ig");
    expect(markup).not.toContain("Enviar mensagem");
  });
});

describe("Fila — até 3 cards renderizados", () => {
  it("3 leads na fila -> 3 data-lead-card, só o 1º com botão 'Enviar mensagem'", () => {
    const items = [
      { id: "1", username: "um.ig", name: null },
      { id: "2", username: "dois.ig", name: null },
      { id: "3", username: "tres.ig", name: null },
    ];
    const markup = renderToStaticMarkup(
      <div>
        {items.map((item, idx) => (
          <LeadCard key={item.id} item={item} active={idx === 0} ready={idx === 0} waiting={false} countdown="0:00" onSend={() => {}} onSkip={() => {}} />
        ))}
      </div>
    );
    expect(markup.match(/data-lead-card/g)?.length).toBe(3);
    expect(markup.match(/Enviar mensagem/g)?.length).toBe(1);
  });

  it("só 1 lead na fila -> só 1 card (nunca cards vazios/fantasma)", () => {
    const items = [{ id: "1", username: "unico.ig", name: null }];
    const markup = renderToStaticMarkup(
      <div>
        {items.map((item, idx) => (
          <LeadCard key={item.id} item={item} active={idx === 0} ready={idx === 0} waiting={false} countdown="0:00" onSend={() => {}} onSkip={() => {}} />
        ))}
      </div>
    );
    expect(markup.match(/data-lead-card/g)?.length).toBe(1);
  });
});
