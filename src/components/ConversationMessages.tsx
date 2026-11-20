"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { shouldPoll, nextPollCursor, dedupeIncomingMessages, isNearBottom } from "@/lib/conversation-polling";

type MessageDTO = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  sender: "LEAD" | "AI" | "HUMAN" | "SYSTEM";
  content: string;
  mediaUrl: string | null;
  // PENDING/SENDING nunca chegam até aqui — filtradas tanto na carga
  // inicial (conversas/[id]/page.tsx) quanto no polling (mensagens/
  // route.ts), ver src/lib/message-visibility.ts: a resposta da IA só
  // aparece depois de enviada de verdade (SENT), nunca antes.
  status: "SENT" | "FAILED";
  visibleAt: string;
};

const POLL_INTERVAL_MS = 3500;
// Quão perto do fim da página contamos como "já está lendo o fim da
// conversa" — dentro dessa margem, mensagens novas puxam a rolagem junto;
// fora dela (lendo mensagens antigas mais acima), a rolagem nunca se move.
const NEAR_BOTTOM_THRESHOLD_PX = 64;

function formatMessageTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    // Sem isso, usa o fuso do navegador do operador — quase sempre
    // Brasília também, mas fixa pra nunca depender disso.
    timeZone: "America/Sao_Paulo",
  });
}

function MessageBubble({ m }: { m: MessageDTO }) {
  return (
    <div className={`flex ${m.direction === "INBOUND" ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[65%] rounded-block px-2.5 py-1.5 text-xs ${
          m.direction === "INBOUND"
            ? "bg-vexo-bg text-vexo-fg"
            : m.sender === "HUMAN"
              ? "bg-vexo-warning/20 text-vexo-fg"
              : "bg-vexo-accent text-vexo-accentFg"
        }`}
      >
        {m.mediaUrl ? <p className="italic opacity-80">{m.content}</p> : <p>{m.content}</p>}
        <p className="mt-0.5 text-caption opacity-60">
          {m.sender === "AI" ? "IA" : m.sender === "HUMAN" ? "Humano" : m.sender === "SYSTEM" ? "Sistema" : "Lead"} ·{" "}
          {formatMessageTime(m.visibleAt)}
          {m.status === "FAILED" ? " · falhou" : ""}
        </p>
      </div>
    </div>
  );
}

// Mantém a conversa atualizada sozinha enquanto a aba estiver aberta e
// visível: busca só as mensagens mais novas que a última já exibida (nunca
// a conversa inteira) a cada ~3.5s, sem piscar/recarregar e sem puxar a
// rolagem de quem está lendo mensagens antigas mais acima — só acompanha
// o fim quando o operador já estava no fim. Pausa com a aba escondida e
// retoma (com uma busca imediata, pra não esperar o próximo tick) ao
// voltar. isFetchingRef garante nunca duas buscas em paralelo.
export function ConversationMessages({
  conversationId,
  initialMessages,
}: {
  conversationId: string;
  initialMessages: MessageDTO[];
}) {
  const [messages, setMessages] = useState(initialMessages);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const isFetchingRef = useRef(false);

  const poll = useCallback(async () => {
    if (!shouldPoll(document.visibilityState, isFetchingRef.current)) return;
    isFetchingRef.current = true;
    try {
      const current = messagesRef.current;
      const { afterVisibleAt, afterId } = nextPollCursor(current);

      const res = await fetch(
        `/api/conversas/${conversationId}/mensagens?afterVisibleAt=${encodeURIComponent(afterVisibleAt)}&afterId=${encodeURIComponent(afterId)}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const data = (await res.json()) as { messages: MessageDTO[] };
      if (data.messages.length === 0) return;

      const wasNearBottom = isNearBottom(
        window.scrollY,
        window.innerHeight,
        document.documentElement.scrollHeight,
        NEAR_BOTTOM_THRESHOLD_PX
      );
      const fresh = dedupeIncomingMessages(current, data.messages);
      if (fresh.length === 0) return;

      setMessages([...current, ...fresh]);
      if (wasNearBottom) {
        // Depois do DOM aplicar as novas mensagens, não antes — senão
        // scrollHeight ainda é o antigo e a rolagem para curta.
        requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight }));
      }
    } finally {
      isFetchingRef.current = false;
    }
  }, [conversationId]);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    function startPolling() {
      if (intervalId) return;
      intervalId = setInterval(poll, POLL_INTERVAL_MS);
    }
    function stopPolling() {
      if (!intervalId) return;
      clearInterval(intervalId);
      intervalId = null;
    }
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void poll();
        startPolling();
      } else {
        stopPolling();
      }
    }

    if (document.visibilityState === "visible") startPolling();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [poll]);

  return (
    <>
      {messages.map((m) => (
        <MessageBubble key={m.id} m={m} />
      ))}
      {messages.length === 0 && <p className="text-xs text-vexo-muted">Nenhuma mensagem ainda.</p>}
    </>
  );
}
