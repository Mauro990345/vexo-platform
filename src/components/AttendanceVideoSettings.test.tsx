import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { AttendanceVideoSettings } from "./AttendanceVideoSettings";

function render(props: Partial<Parameters<typeof AttendanceVideoSettings>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(AttendanceVideoSettings, {
      currentVideoUrl: null,
      videoEnabledDefault: true,
      introEnabledDefault: true,
      introCaptionDefault: "",
      ...props,
    })
  );
}

describe("AttendanceVideoSettings", () => {
  it("sem arquivo nenhum: a caixinha 'Enviar' do vídeo vem desabilitada e desmarcada, mesmo com videoEnabledDefault=true", () => {
    const html = render({ currentVideoUrl: null, videoEnabledDefault: true });
    expect(html).toContain('name="confirmationVideoEnabled"');
    expect(html).toMatch(/name="confirmationVideoEnabled"[^>]*disabled=""/);
  });

  it("com vídeo salvo: a caixinha 'Enviar' do vídeo vem habilitada", () => {
    const html = render({ currentVideoUrl: "/uploads/video.mp4", videoEnabledDefault: true });
    const videoCheckboxMatch = html.match(/<input[^>]*name="confirmationVideoEnabled"[^>]*>/);
    expect(videoCheckboxMatch).not.toBeNull();
    expect(videoCheckboxMatch![0]).not.toMatch(/\sdisabled=""/);
    expect(videoCheckboxMatch![0]).toContain('checked=""');
  });

  it("vídeo desmarcado (videoEnabledDefault=false): a caixinha da apresentação vem desabilitada", () => {
    const html = render({ currentVideoUrl: "/uploads/video.mp4", videoEnabledDefault: false, introEnabledDefault: false });
    const introCheckboxMatch = html.match(/<input[^>]*name="confirmationVideoCaptionEnabled"[^>]*>/);
    expect(introCheckboxMatch).not.toBeNull();
    expect(introCheckboxMatch![0]).toMatch(/\sdisabled=""/);
  });

  it("mostra o link 'Ver vídeo atual' e a caixinha 'Remover' só quando há vídeo salvo", () => {
    expect(render({ currentVideoUrl: null })).not.toContain("Ver vídeo atual");
    expect(render({ currentVideoUrl: "/uploads/video.mp4" })).toContain("Ver vídeo atual");
  });
});
