import Link from "next/link";
import type { ReactNode } from "react";

// Perguntas frequentes da página pública (#duvidas). Cada resposta foi
// conferida no código (ver PR). Ajustes de verdade em relação ao texto
// pedido: a 8 (reativação — por padrão a clínica tem 2 prazos, 30 e 60 dias,
// e cada prazo gera UM contato; não é "uma única data" por paciente) e a 9
// (link pra página de exclusão).
const LINK = "text-vexo-pubButton underline underline-offset-2";

export const FAQ_ITEMS: Array<{ q: string; a: ReactNode }> = [
  {
    q: "O que o VEXO IA faz, na prática?",
    a: "Ele cuida do caminho entre o seguidor e a consulta: a abordagem inicial, a conversa no Instagram, o agendamento, os lembretes pelo WhatsApp e a reativação de quem sumiu. A equipe da clínica só atende o paciente.",
  },
  {
    q: "O VEXO substitui gestor de tráfego, campanha paga, CRC e SDR?",
    a: "Sim, nas funções que importam para a clínica. O VEXO capta pelo Instagram sem depender de anúncios, o que dispensa a campanha paga e o gestor de tráfego. Ele conduz a conversa como um SDR e organiza agendamentos, lembretes e retornos como um CRC. A equipe da clínica só atende o paciente.",
  },
  {
    q: "A primeira mensagem é enviada por um robô?",
    a: "Não. A primeira mensagem é enviada por uma equipe de social sellers, de forma humana. A IA entra quando o paciente responde.",
  },
  {
    q: "A IA conversa também pelo WhatsApp?",
    a: "A conversa com o paciente acontece no Instagram. O WhatsApp é usado para confirmar o agendamento, enviar lembretes, fazer o follow-up, reativar pacientes e entregar o relatório.",
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
    a: "Por um painel com os números de abordagens, conversas, agendamentos e comparecimentos, e por um relatório automático, quinzenal ou mensal, enviado pelo WhatsApp.",
  },
  {
    q: "Como funciona a reativação de pacientes?",
    a: "Depois do prazo de retorno definido pela clínica (um padrão da clínica ou o escolhido para cada paciente), o VEXO faz um contato para o paciente voltar, pelo WhatsApp ou pelo Instagram. Cada prazo gera um único contato, sem insistência.",
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
