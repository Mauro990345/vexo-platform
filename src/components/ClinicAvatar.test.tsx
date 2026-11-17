import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ClinicAvatar, resolveClinicAvatarMode } from "./ClinicAvatar";

describe("resolveClinicAvatarMode", () => {
  it("com foto e sem falha anterior -> 'photo'", () => {
    expect(resolveClinicAvatarMode("https://scontent.cdninstagram.com/foto.jpg", false)).toBe("photo");
  });
  it("sem Instagram conectado (null) -> 'initials'", () => {
    expect(resolveClinicAvatarMode(null, false)).toBe("initials");
  });
  it("sem foto cadastrada (undefined) -> 'initials'", () => {
    expect(resolveClinicAvatarMode(undefined, false)).toBe("initials");
  });
  // "Foto com erro volta pras iniciais": é exatamente a regra que o
  // componente usa no onError (setFailed(true) -> failed=true) — o
  // ambiente de teste deste projeto roda só em Node, sem jsdom (ver
  // vitest.config.ts), então o evento `onError` de verdade do <img> não dá
  // pra disparar aqui; esta é a MESMA decisão que o componente consulta
  // depois desse evento, testada diretamente.
  it("tinha foto, mas falhou ao carregar -> 'initials' (mesmo valor que o onError do componente produz)", () => {
    expect(resolveClinicAvatarMode("https://scontent.cdninstagram.com/foto.jpg", true)).toBe("initials");
  });
});

describe("ClinicAvatar", () => {
  it("com foto de perfil: renderiza <img>, nunca as iniciais", () => {
    const markup = renderToStaticMarkup(<ClinicAvatar name="Clínica Demo" profilePictureUrl="https://scontent.cdninstagram.com/foto.jpg" />);
    expect(markup).toContain("<img");
    expect(markup).toContain("https://scontent.cdninstagram.com/foto.jpg");
    expect(markup).not.toContain(">CD<");
  });

  it("sem Instagram conectado (profilePictureUrl null): mostra as iniciais, nunca uma tag <img>", () => {
    const markup = renderToStaticMarkup(<ClinicAvatar name="Clínica Demo" profilePictureUrl={null} />);
    expect(markup).not.toContain("<img");
    expect(markup).toContain(">CD<");
  });

  it("sem profilePictureUrl nenhum (omitido): mesma coisa, iniciais", () => {
    const markup = renderToStaticMarkup(<ClinicAvatar name="Ana Clara" />);
    expect(markup).not.toContain("<img");
    expect(markup).toContain(">AC<");
  });

  it("initialsClassName só se aplica ao fallback de iniciais, nunca à foto", () => {
    const withPhoto = renderToStaticMarkup(<ClinicAvatar name="Clínica Demo" profilePictureUrl="https://x.com/f.jpg" initialsClassName="bg-vexo-success/25" />);
    expect(withPhoto).not.toContain("bg-vexo-success/25");

    const withoutPhoto = renderToStaticMarkup(<ClinicAvatar name="Clínica Demo" profilePictureUrl={null} initialsClassName="bg-vexo-success/25" />);
    expect(withoutPhoto).toContain("bg-vexo-success/25");
  });

  it("tamanho padrão (lg, 48px)", () => {
    const markup = renderToStaticMarkup(<ClinicAvatar name="Clínica Demo" profilePictureUrl={null} />);
    expect(markup).toContain("h-12");
    expect(markup).toContain("w-12");
  });
});
