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
