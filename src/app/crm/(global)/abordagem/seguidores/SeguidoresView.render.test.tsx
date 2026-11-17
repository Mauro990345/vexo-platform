import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SeguidoresView } from "./SeguidoresView";

describe("SeguidoresView", () => {
  it("renderiza o aviso de uso interno, a lista de clínicas, os passos e os cuidados", () => {
    const html = renderToStaticMarkup(<SeguidoresView clinics={[{ id: "clinic-1", name: "Clínica Demo", igUsername: "clinica.demo" }]} />);
    expect(html).toContain("Uso interno");
    expect(html).toContain("instagram.com");
    expect(html).toContain("Clínica Demo");
    expect(html).toContain("Copiar script");
    expect(html).toContain("Começar do zero");
    expect(html).toContain("Console");
    expect(html).toContain("429");
    expect(html).toContain("Enviar lista de leads"); // UploadForm reaproveitado, nunca duplicado
  });

  it("sem clínicas: renderiza sem quebrar", () => {
    const html = renderToStaticMarkup(<SeguidoresView clinics={[]} />);
    expect(html).toContain("Buscar seguidores");
  });
});
