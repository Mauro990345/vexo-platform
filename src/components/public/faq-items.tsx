import Link from "next/link";
import type { ReactNode } from "react";

// Perguntas frequentes da página pública (#duvidas) — 8 perguntas. Dizem O
// QUE o VEXO faz, nunca COMO (sem canal por função, sem regra de
// reativação, sem quem faz a primeira mensagem).
const LINK = "text-vexo-pubButton underline underline-offset-2";

export const FAQ_ITEMS: Array<{ q: string; a: ReactNode }> = [
  {
    q: "O que o VEXO IA faz, na prática?",
    a: "Ele cuida do caminho entre o seguidor e a consulta: a abordagem, a conversa, o agendamento, os lembretes e a reativação de quem sumiu. A equipe da clínica só atende o paciente.",
  },
  {
    q: "O VEXO substitui gestor de tráfego, campanha paga, CRC e SDR?",
    a: "Sim, nas funções que importam para a clínica. O VEXO capta sem depender de anúncios, conduz a conversa como um SDR e organiza agendamentos, lembretes e retornos como um CRC. A equipe da clínica só atende o paciente.",
  },
  {
    q: "Quem faz o contato com os pacientes?",
    a: "Um trabalho conjunto de social sellers e inteligência artificial, com abordagem humana e resposta rápida.",
  },
  {
    q: "Preciso trocar meu número ou meu Instagram?",
    a: "Não. O VEXO se conecta às contas que a clínica já usa, com a autorização dela, e ela pode desconectar quando quiser.",
  },
  {
    q: "Os dados da clínica e dos pacientes estão seguros?",
    a: (
      <>
        A conexão é criptografada (HTTPS), as chaves de acesso às integrações são cifradas, as senhas são guardadas em hash e a
        plataforma só abre com login. Usamos apenas os dados necessários. Os detalhes estão na{" "}
        <Link href="/privacidade" className={LINK}>
          Política de privacidade
        </Link>
        .
      </>
    ),
  },
  {
    q: "Como a clínica acompanha os resultados?",
    a: "Por um painel com os números de abordagens, conversas, agendamentos e comparecimentos, e por um relatório automático enviado periodicamente.",
  },
  {
    q: "Posso cancelar ou revogar o acesso quando quiser?",
    a: (
      <>
        Sim. A clínica pode revogar o acesso ao Instagram direto na Meta, desconectar o aparelho vinculado do WhatsApp e solicitar a
        exclusão dos dados pela{" "}
        <Link href="/exclusao-de-dados" className={LINK}>
          página de exclusão de dados
        </Link>
        .
      </>
    ),
  },
  {
    q: "Quanto custa e como começo?",
    a: (
      <>
        Fale com o time do VEXO pelo e-mail{" "}
        <a href="mailto:contato@vexoia.com.br" className={LINK}>
          contato@vexoia.com.br
        </a>
        . Entendemos a clínica e enviamos uma proposta.
      </>
    ),
  },
];
