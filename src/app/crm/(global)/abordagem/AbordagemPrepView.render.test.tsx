import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AbordagemPrepView } from "./AbordagemPrepView";

const window = { startMinute: 7 * 60, endMinute: 20 * 60 };
const timing = { waitMinMinutes: 1, waitMaxMinutes: 2, batchSize: 30, batchPauseHours: 2 };

// Link "Buscar seguidores" (ver DESIGN.md/follower-tool.ts) — só aparece
// quando o servidor diz que a ferramenta está disponível (interruptor
// ligado E usuário é INTERNAL_ADMIN); nunca aparece por padrão.
describe("AbordagemPrepView — link 'Buscar seguidores'", () => {
  it("showFollowerToolLink ausente (padrão) — sem o link", () => {
    const html = renderToStaticMarkup(<AbordagemPrepView clinics={[]} window={window} timing={timing} />);
    expect(html).not.toContain("Buscar seguidores");
  });

  it("showFollowerToolLink=false — sem o link", () => {
    const html = renderToStaticMarkup(<AbordagemPrepView clinics={[]} window={window} timing={timing} showFollowerToolLink={false} />);
    expect(html).not.toContain("Buscar seguidores");
  });

  it("showFollowerToolLink=true — mostra o link, apontando pra /crm/abordagem/seguidores", () => {
    const html = renderToStaticMarkup(<AbordagemPrepView clinics={[]} window={window} timing={timing} showFollowerToolLink={true} />);
    expect(html).toContain("Buscar seguidores");
    expect(html).toContain('href="/crm/abordagem/seguidores"');
  });
});

function baseClinic(overrides: Record<string, unknown> = {}) {
  return {
    id: "clinic-1",
    name: "Clínica Demo",
    igUsername: "clinica.demo",
    dailyLimit: 60,
    activeInQueue: true,
    paused: false,
    hasMessages: true,
    leadsRemaining: 320,
    ...overrides,
  };
}

// Contador "N na fila · uns X dias" por clínica (ver DESIGN.md — pedido
// explícito: saber quando reabastecer a lista), 2ª linha pequena embaixo
// do nome, colorida pelo nível de urgência (approachQueueLevel).
describe("AbordagemPrepView — contador de leads restantes por clínica", () => {
  it("mostra 'N na fila · uns X dias' com 2 dias ou mais de sobra — cor normal", () => {
    const html = renderToStaticMarkup(<AbordagemPrepView clinics={[baseClinic({ leadsRemaining: 320, dailyLimit: 60 })]} window={window} timing={timing} />);
    expect(html).toContain("320 na fila · uns 5 dias");
    expect(html).toContain("text-vexo-mutedLight");
  });

  it("menos de 2 dias de sobra — cor de aviso", () => {
    const html = renderToStaticMarkup(<AbordagemPrepView clinics={[baseClinic({ leadsRemaining: 90, dailyLimit: 60 })]} window={window} timing={timing} />);
    expect(html).toContain("90 na fila · uns 1,5 dia");
    expect(html).toContain("text-vexo-warning");
  });

  it("menos de 1 dia de sobra — cor de perigo", () => {
    const html = renderToStaticMarkup(<AbordagemPrepView clinics={[baseClinic({ leadsRemaining: 30, dailyLimit: 60 })]} window={window} timing={timing} />);
    expect(html).toContain("30 na fila · menos de 1 dia");
    expect(html).toContain("text-vexo-error");
  });

  it("fila vazia — mostra só 'Fila vazia', cor de perigo", () => {
    const html = renderToStaticMarkup(<AbordagemPrepView clinics={[baseClinic({ leadsRemaining: 0 })]} window={window} timing={timing} />);
    expect(html).toContain("Fila vazia");
    expect(html).not.toContain("0 na fila");
    expect(html).toContain("text-vexo-error");
  });
});

// Botão "Link da Fila" (pedido explícito, ver DESIGN.md) — atalho pra
// copiar o mesmo ClientFilaLink que o modal "Criar painel" já usa, direto
// desta lista, ao lado de "Mensagens". Este projeto não roda testes com
// jsdom/clique simulado (toda interação é testada pelas SERVER ACTIONS
// isoladas, ver client-fila-link.test.ts — getOrCreateClientFilaLink já
// está coberto lá); aqui só confirmamos o que o render estático consegue
// provar: o botão existe, é um <button> (não navega), e nada em volta
// mudou.
describe("AbordagemPrepView — botão 'Link da Fila' ao lado de cada clínica", () => {
  it("mostra o botão 'Link da Fila' pra cada clínica da lista", () => {
    const html = renderToStaticMarkup(<AbordagemPrepView clinics={[baseClinic()]} window={window} timing={timing} />);
    expect(html).toContain(">Link da Fila<");
  });

  it("é um <button>, nunca um <a> (não navega — só copia)", () => {
    const html = renderToStaticMarkup(<AbordagemPrepView clinics={[baseClinic()]} window={window} timing={timing} />);
    const buttonIndex = html.indexOf(">Link da Fila<");
    const beforeButton = html.slice(Math.max(0, buttonIndex - 220), buttonIndex);
    expect(beforeButton).toContain("<button");
  });

  it("não mexe no botão/texto 'Mensagens' que já existia", () => {
    const html = renderToStaticMarkup(<AbordagemPrepView clinics={[baseClinic({ hasMessages: true })]} window={window} timing={timing} />);
    expect(html).toContain(">Mensagens<");
    expect(html).toContain('href="/crm/abordagem/clinic-1/mensagens"');
  });
});
