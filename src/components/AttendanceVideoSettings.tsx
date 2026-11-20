"use client";

import { useState, type ChangeEvent } from "react";

// Vídeo + frase de apresentação da sequência de confirmação de presença
// (ver DESIGN.md e fireAttendanceConfirmationSequence/
// buildAttendanceSequenceItems, conversation-pipeline.ts) — os 2 únicos
// itens da sequência com dependência entre si: a frase ("vou te mandar um
// vídeo") só pode ficar marcada se o vídeo também estiver, e o vídeo só
// pode ficar marcado se houver arquivo de verdade (enviado agora OU já
// salvo antes, sem a caixinha "Remover" marcada). "use client" só por
// causa dessas 2 regras — os outros 2 itens da sequência (cafezinho,
// mensagem final) são caixinhas simples, sem dependência, direto na
// página (Server Component).
export function AttendanceVideoSettings({
  currentVideoUrl,
  videoEnabledDefault,
  introEnabledDefault,
  introCaptionDefault,
}: {
  currentVideoUrl: string | null;
  videoEnabledDefault: boolean;
  introEnabledDefault: boolean;
  introCaptionDefault: string;
}) {
  const [hasNewFile, setHasNewFile] = useState(false);
  const [removeChecked, setRemoveChecked] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(videoEnabledDefault);
  const [introEnabled, setIntroEnabled] = useState(introEnabledDefault && videoEnabledDefault);

  // Depois de salvar, só existe vídeo de verdade se: um arquivo novo foi
  // escolhido agora, OU já havia um vídeo salvo e "Remover" não está
  // marcado. É essa previsão (não só o estado salvo) que decide se a
  // caixinha "Enviar" do vídeo pode ficar marcada.
  const willHaveVideo = hasNewFile || (Boolean(currentVideoUrl) && !removeChecked);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const chosen = Boolean(e.target.files && e.target.files.length > 0);
    setHasNewFile(chosen);
    // Escolher um arquivo novo enquanto "Remover" estava marcado não faz
    // sentido mais — o arquivo novo substitui o antigo, nunca é removido.
    if (chosen) setRemoveChecked(false);
  }

  function handleRemoveChange(e: ChangeEvent<HTMLInputElement>) {
    const checked = e.target.checked;
    setRemoveChecked(checked);
    if (checked) {
      setVideoEnabled(false);
      setIntroEnabled(false);
    }
  }

  function handleVideoEnabledChange(e: ChangeEvent<HTMLInputElement>) {
    const checked = e.target.checked;
    setVideoEnabled(checked);
    if (!checked) setIntroEnabled(false); // sem vídeo, a frase que o anuncia também sai
  }

  return (
    <>
      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <label className="text-xs text-vexo-muted" htmlFor="confirmationVideoFile">
            Vídeo de confirmação de agendamento (reforça comparecimento)
          </label>
          <label className="flex shrink-0 items-center gap-1 text-card text-vexo-muted">
            <input
              type="checkbox"
              name="confirmationVideoEnabled"
              checked={videoEnabled}
              disabled={!willHaveVideo}
              onChange={handleVideoEnabledChange}
              className="rounded border-vexo-border disabled:opacity-40"
            />
            Enviar
          </label>
        </div>
        {currentVideoUrl && (
          <div className="mb-1.5 flex items-center justify-between gap-2 rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5">
            <a
              href={currentVideoUrl}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 truncate text-xs text-vexo-accent hover:underline"
            >
              Ver vídeo atual
            </a>
            <label className="flex shrink-0 items-center gap-1 text-card text-vexo-muted">
              <input
                type="checkbox"
                name="removeConfirmationVideo"
                checked={removeChecked}
                onChange={handleRemoveChange}
                className="rounded border-vexo-border"
              />
              Remover
            </label>
          </div>
        )}
        <input type="hidden" name="currentConfirmationVideoUrl" value={currentVideoUrl ?? ""} />
        <input
          id="confirmationVideoFile"
          name="confirmationVideoFile"
          type="file"
          accept="video/*"
          onChange={handleFileChange}
          className="block w-full text-xs text-vexo-muted file:mr-2 file:rounded-lg file:border file:border-vexo-border file:bg-vexo-bg file:px-2.5 file:py-1.5 file:text-xs file:text-vexo-fg hover:file:border-vexo-accent"
        />
        <p className="mt-1 text-caption text-vexo-muted">
          {currentVideoUrl ? "Escolher um novo arquivo substitui o atual. " : ""}
          MP4, MOV ou WEBM — até 25MB. Enviado automaticamente pelo Instagram assim que um
          agendamento é confirmado na conversa — não é preciso disparar manualmente.
          {!willHaveVideo && ' Sem arquivo, a caixinha "Enviar" acima fica desligada.'}
        </p>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <label className="text-xs text-vexo-muted" htmlFor="confirmationVideoCaption">
            Frase que acompanha o vídeo de confirmação
          </label>
          <label className="flex shrink-0 items-center gap-1 text-card text-vexo-muted">
            <input
              type="checkbox"
              name="confirmationVideoCaptionEnabled"
              checked={introEnabled}
              disabled={!videoEnabled}
              onChange={(e) => setIntroEnabled(e.target.checked)}
              className="rounded border-vexo-border disabled:opacity-40"
            />
            Enviar
          </label>
        </div>
        <input
          id="confirmationVideoCaption"
          name="confirmationVideoCaption"
          defaultValue={introCaptionDefault}
          placeholder="Ex: Vou te mandar um vídeo rápido mostrando como é o nosso atendimento 🙂"
          className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
        />
        <p className="mt-1 text-caption text-vexo-muted">
          Mandada como mensagem de texto separada, logo antes do vídeo (o Instagram não deixa
          combinar texto e vídeo numa mensagem só). Só pode ficar marcada com o vídeo também
          marcado. Vazio usa a frase padrão acima.
        </p>
      </div>
    </>
  );
}
