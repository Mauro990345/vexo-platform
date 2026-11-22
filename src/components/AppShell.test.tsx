import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppShell, type NavGroup } from "@/components/AppShell";

// Badge numérico opcional por item (pedido: "Status" no menu global com
// contagem de mensagens FAILED) — testado aqui no componente genérico, não
// no layout específico, porque é o AppShell que decide ONDE e COMO mostrar
// (sempre vexo-error, nunca uma cor nova por item; escondido quando 0).
vi.mock("next/navigation", () => ({ usePathname: () => "/crm" }));
vi.mock("@/components/SignOutButton", () => ({ SignOutButton: () => null }));

function groups(badge?: number): NavGroup[] {
  return [
    {
      label: "Operação",
      items: [
        { href: "/crm", label: "Contas", icon: <span /> },
        { href: "/crm/dispatch-status", label: "Status", icon: <span />, badge },
      ],
    },
  ];
}

// Ícone decorativo (mascote circular branco+azul) ao lado do logo, só na
// sidebar desktop — pedido explícito, puramente estético.
describe("AppShell — ícone decorativo da sidebar", () => {
  it("renderiza o svg do mascote ao lado do quadrado azul e do nome VEXO", () => {
    const markup = renderToStaticMarkup(
      <AppShell navGroups={groups()} userLabel="Admin">
        <div />
      </AppShell>
    );
    expect(markup).toContain("<svg");
    expect(markup).toContain("fill-vexo-accentFg");
    expect(markup).toContain("fill-vexo-accent");
  });
});

describe("AppShell — badge de contagem no item do menu", () => {
  it("badge > 0: mostra o número ao lado do item, na cor de erro (vexo-error)", () => {
    const markup = renderToStaticMarkup(
      <AppShell navGroups={groups(3)} userLabel="Admin">
        <div />
      </AppShell>
    );
    expect(markup).toContain(">3<");
    expect(markup).toContain("bg-vexo-error");
  });

  it("badge = 0: não mostra nenhum badge (item fica limpo)", () => {
    const markup = renderToStaticMarkup(
      <AppShell navGroups={groups(0)} userLabel="Admin">
        <div />
      </AppShell>
    );
    expect(markup).not.toContain("bg-vexo-error");
  });

  it("sem badge (undefined): não mostra nenhum badge", () => {
    const markup = renderToStaticMarkup(
      <AppShell navGroups={groups(undefined)} userLabel="Admin">
        <div />
      </AppShell>
    );
    expect(markup).not.toContain("bg-vexo-error");
  });
});
