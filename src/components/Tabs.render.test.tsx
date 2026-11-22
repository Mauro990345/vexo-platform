import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Tabs } from "./Tabs";

// Pedido explícito (inspirado num app concorrente): aba inativa em cinza,
// só a ativa fica off-white — antes as duas eram sempre off-white, só o
// traço azul embaixo (continua existindo, ver underline em Tabs.tsx)
// indicava qual estava selecionada.
describe("Tabs — título inativo em cinza, ativo em off-white", () => {
  it("aba ativa (defaultTabId): text-vexo-tabFg; abas inativas: text-vexo-muted", () => {
    const markup = renderToStaticMarkup(
      <Tabs
        defaultTabId="t1"
        tabs={[
          { id: "t0", label: "Primeira aba", content: <div>A</div> },
          { id: "t1", label: "Segunda aba", content: <div>B</div> },
          { id: "t2", label: "Terceira aba", content: <div>C</div> },
        ]}
      />
    );

    const activeIdx = markup.indexOf("Segunda aba");
    const activeButtonStart = markup.lastIndexOf("<button", activeIdx);
    expect(markup.slice(activeButtonStart, activeIdx)).toContain("text-vexo-tabFg");
    expect(markup.slice(activeButtonStart, activeIdx)).not.toContain("text-vexo-muted");

    const inactiveIdx = markup.indexOf("Primeira aba");
    const inactiveButtonStart = markup.lastIndexOf("<button", inactiveIdx);
    expect(markup.slice(inactiveButtonStart, inactiveIdx)).toContain("text-vexo-muted");
    expect(markup.slice(inactiveButtonStart, inactiveIdx)).not.toContain("text-vexo-tabFg");
  });

  it("sem defaultTabId: a 1ª aba vira a ativa (off-white), as outras ficam cinza", () => {
    const markup = renderToStaticMarkup(
      <Tabs
        tabs={[
          { id: "t0", label: "Primeira", content: <div>A</div> },
          { id: "t1", label: "Segunda", content: <div>B</div> },
        ]}
      />
    );
    const firstIdx = markup.indexOf("Primeira");
    const firstButtonStart = markup.lastIndexOf("<button", firstIdx);
    expect(markup.slice(firstButtonStart, firstIdx)).toContain("text-vexo-tabFg");

    const secondIdx = markup.indexOf("Segunda");
    const secondButtonStart = markup.lastIndexOf("<button", secondIdx);
    expect(markup.slice(secondButtonStart, secondIdx)).toContain("text-vexo-muted");
  });
});
