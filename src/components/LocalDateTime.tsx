"use client";

import { useEffect, useState } from "react";

// Datas de diagnóstico (ex: /crm/webhook-logs) vêm do banco em UTC — exibir
// direto com toLocaleString() do lado do SERVIDOR usa o fuso do servidor
// (Railway roda em UTC), não o do navegador de quem está olhando, sem
// nenhuma indicação disso na tela: parece "recente" ou "antigo" errado.
// Renderiza com o rótulo UTC explícito (mesmo valor no servidor e no
// primeiro render do cliente, pra não gerar mismatch de hidratação) e
// troca pro fuso local do navegador assim que monta.
function formatUtc(iso: string): string {
  return `${new Date(iso).toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

export function LocalDateTime({ iso }: { iso: string }) {
  const [text, setText] = useState(() => formatUtc(iso));

  useEffect(() => {
    setText(new Date(iso).toLocaleString("pt-BR"));
  }, [iso]);

  return <span>{text}</span>;
}
