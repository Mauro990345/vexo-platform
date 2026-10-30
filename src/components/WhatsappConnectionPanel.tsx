"use client";

import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import {
  type WhatsappConnectionState,
  shouldShowWhatsappResetAction,
  whatsappResetActionLabel,
  isWhatsappPairingStuck,
} from "@/lib/whatsapp-connection";

const STATUS_LABELS: Record<WhatsappConnectionState, string> = {
  open: "Conectado",
  connecting: "Conectando…",
  close: "Desconectado",
  unknown: "Status desconhecido",
};

const STATUS_DOT: Record<WhatsappConnectionState, string> = {
  open: "bg-vexo-success",
  connecting: "bg-vexo-warning",
  close: "bg-vexo-muted",
  unknown: "bg-vexo-muted",
};

// ~3s (pedido explícito) — leve o bastante pra sentir a conexão completar
// quase na hora, sem virar uma rajada de chamadas na Evolution.
const POLL_INTERVAL_MS = 3_000;

// Painel de conexão do WhatsApp (pareamento por QR code) — usado pelo CRM
// interno (/crm/clinicas/[id]/whatsapp). Conectar canais é responsabilidade
// da M8 Growth, não da clínica, então não existe mais versão disso no
// painel do cliente.
//
// "use client" (pedido explícito, bug real investigado): a tela antiga era
// 100% servidor, sem nenhuma atualização automática — sem webhook de
// connection.update (não existe no VEXO) e sem polling nenhum, o único
// jeito de descobrir que conectou era recarregar a página manualmente. O
// poll aqui SÓ consulta status (checkStatusAction — connectionState, nunca
// create/connect), então nunca troca o QR embaixo de quem está
// escaneando; quem continua pedindo QR novo é só o link "Atualizar /
// verificar conexão" de sempre.
export function WhatsappConnectionPanel({
  instanceName,
  status: initialStatus,
  qrBase64,
  statusError,
  recoveredMessage,
  refreshHref,
  description,
  disconnectAction,
  resetPairingAction,
  renameAction,
  resetAction,
  checkStatusAction,
}: {
  instanceName: string;
  status: WhatsappConnectionState;
  qrBase64: string | null;
  statusError: string | null;
  // Pedido explícito (item "d"): avisa quando ensureWhatsappQrForClinic se
  // recuperou sozinho de uma instância quebrada (ver whatsapp-connection.ts)
  // — não é um erro, estilo neutro (não vermelho), separado de statusError.
  recoveredMessage: string | null;
  refreshHref: string;
  description: string;
  // "Desconectar" (status "open") — só solta o número, instância continua.
  disconnectAction?: (formData: FormData) => Promise<void>;
  // "Reiniciar pareamento" (status "connecting") — apaga e deixa a
  // próxima carga da tela recriar do zero (ver resetWhatsappPairing,
  // whatsapp-connection.ts). Ação DIFERENTE de disconnectAction — logout
  // sozinho não limpa uma sessão travada.
  resetPairingAction?: (formData: FormData) => Promise<void>;
  renameAction?: (formData: FormData) => Promise<void>;
  resetAction?: () => Promise<void>;
  checkStatusAction?: () => Promise<WhatsappConnectionState>;
}) {
  const [status, setStatus] = useState(initialStatus);
  // "Desde quando" o QR atual está tentando parear — reinicia toda vez
  // que o servidor manda um status/QR novo (navegação: "Atualizar", ou
  // "Reiniciar pareamento" recarregando a página). Usado só pro
  // heurístico de "pareamento travado" abaixo (pairingStuck).
  const [connectingSince, setConnectingSince] = useState(() => Date.now());
  const [pairingStuck, setPairingStuck] = useState(false);

  // Resincroniza sempre que o servidor mandar um valor novo (navegação
  // pro mesmo link, ex. o próprio "Atualizar / verificar conexão").
  useEffect(() => {
    setStatus(initialStatus);
    setConnectingSince(Date.now());
    setPairingStuck(false);
  }, [initialStatus]);

  // Poll leve enquanto não conectado — para sozinho ao conectar
  // (`status === "open"`), ao desmontar (navegação/fechar aba — o
  // cleanup do useEffect cobre os dois) e enquanto a aba está fora de
  // foco (visibilitychange), retomando se ela voltar a ficar visível
  // antes de conectar. A cada confirmação de "ainda não conectou",
  // também reavalia pairingStuck (ver isWhatsappPairingStuck,
  // whatsapp-connection.ts) — a Evolution não reporta nenhum estado
  // distinto de "falha de pareamento" pro bug atual (companion_reg_refresh),
  // só continua "connecting" pra sempre; isto é um heurístico de tempo
  // decorrido, o único sinal realista disponível.
  useEffect(() => {
    if (!checkStatusAction || status === "open") return;

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    function poll() {
      checkStatusAction!()
        .then((next) => {
          if (cancelled) return;
          setStatus(next);
          setPairingStuck(next !== "open" && isWhatsappPairingStuck(connectingSince, Date.now()));
        })
        .catch((err) => console.error("[vexo] Falha ao checar status do WhatsApp:", err));
    }

    function start() {
      if (intervalId === null) intervalId = setInterval(poll, POLL_INTERVAL_MS);
    }
    function stop() {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") start();
      else stop();
    }

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [checkStatusAction, status, connectingSince]);

  const isOpen = status === "open";
  const showResetAction = shouldShowWhatsappResetAction(status);
  const resetFormAction = isOpen ? disconnectAction : resetPairingAction;

  return (
    <div className="space-y-2.5 rounded-xl border border-vexo-border bg-vexo-surface p-3.5">
      <div className="flex items-center gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white">
          <MessageCircle className="h-3.5 w-3.5" strokeWidth={2} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">WhatsApp</p>
          <p className="truncate text-xs text-vexo-muted">{description}</p>
          <div className="mt-1 flex items-center gap-1.5 text-card text-vexo-muted">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[status]}`} />
            {STATUS_LABELS[status]} · <span className="font-mono">{instanceName}</span>
          </div>
        </div>

        {showResetAction && resetFormAction && (
          <form action={resetFormAction} className="shrink-0">
            <button className="rounded-lg border border-vexo-border px-2.5 py-1.5 text-xs text-vexo-muted hover:border-vexo-error/40 hover:text-vexo-error">
              {whatsappResetActionLabel(status)}
            </button>
          </form>
        )}
      </div>

      {statusError && (
        <p className="rounded-lg border border-vexo-error/30 bg-vexo-error/10 p-2 text-xs text-vexo-error">{statusError}</p>
      )}

      {/* Pedido explícito (item "d"): "a instância anterior tinha um
          problema e foi recriada sozinha" — estilo neutro (accent, não
          error), nunca junto de statusError (um exclui o outro: ou a
          recuperação funcionou, ou deu erro — ver page.tsx). */}
      {recoveredMessage && !statusError && (
        <p className="rounded-lg border border-vexo-accent/30 bg-vexo-accent/10 p-2 text-xs text-vexo-accent">{recoveredMessage}</p>
      )}

      {isOpen ? (
        <p className="text-xs">WhatsApp conectado e pronto para enviar notificações.</p>
      ) : (
        <div className="space-y-2 border-t border-vexo-border pt-2.5">
          {qrBase64 ? (
            // QR maior (~300px), fundo branco com margem generosa (quiet
            // zone — pedido explícito) e sem suavização de escala
            // (image-rendering: pixelated) — mesmo princípio de "não
            // borrar módulo nenhum" que faz um QR continuar legível
            // ampliado. Ainda compacto: não é o card inteiro, só a
            // imagem ficou maior e mais nítida.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrBase64}
              alt="QR code do WhatsApp"
              className="mx-auto h-[300px] w-[300px] rounded-lg border border-vexo-border bg-white p-5"
              style={{ imageRendering: "pixelated" }}
            />
          ) : statusError ? null : (
            // statusError, quando presente, já explica o motivo (item
            // "d" — nunca duplica a mensagem); isto só aparece no caso
            // raro de qrBase64 nulo sem nenhum erro reportado.
            <p className="text-xs text-vexo-muted">
              Não foi possível gerar o código agora. Clique em "Atualizar / verificar conexão" abaixo para tentar
              de novo.
            </p>
          )}

          <p className="text-card leading-normal text-vexo-muted">
            No celular que vai receber as notificações: WhatsApp → Aparelhos conectados → Conectar um
            aparelho, e escaneie o código acima. Ele expira em segundos — se não der tempo, clique em
            "Atualizar" para gerar um novo.
          </p>

          {status === "connecting" && (
            <p className="text-card leading-normal text-vexo-muted">
              Se o QR não conectar, clique em Reiniciar pareamento e escaneie o novo código.
            </p>
          )}

          {pairingStuck && !statusError && (
            <p className="rounded-lg border border-vexo-error/30 bg-vexo-error/10 p-2 text-xs text-vexo-error">
              O pareamento não concluiu depois de um tempo — provavelmente falhou. Clique em "Reiniciar
              pareamento" e escaneie o novo código.
            </p>
          )}

          <a
            href={refreshHref}
            className="block w-full rounded-lg border border-vexo-accent px-2.5 py-1.5 text-center text-xs font-medium text-vexo-accent hover:bg-vexo-accent/10"
          >
            Atualizar / verificar conexão
          </a>
        </div>
      )}

      {renameAction && !isOpen && (
        <div className="space-y-1.5 border-t border-vexo-border pt-2">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <label className="block text-card text-vexo-muted" htmlFor="instanceName">
              Nome da instância (avançado — ex: reaproveitar uma já conectada)
            </label>
            {resetAction && (
              <form action={resetAction}>
                <button className="shrink-0 text-card text-vexo-accent hover:underline">Restaurar nome padrão</button>
              </form>
            )}
          </div>
          <form action={renameAction} className="flex gap-1.5">
            <input
              id="instanceName"
              name="instanceName"
              defaultValue={instanceName}
              pattern="[a-z0-9-]+"
              title="Apenas letras minúsculas, números e hífen"
              className="flex-1 rounded-lg border border-vexo-border bg-vexo-bg px-2 py-1 text-xs font-mono outline-none focus:border-vexo-accent"
            />
            <button className="rounded-lg border border-vexo-accent px-2.5 py-1 text-xs text-vexo-accent hover:bg-vexo-accent/10">
              Salvar
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
