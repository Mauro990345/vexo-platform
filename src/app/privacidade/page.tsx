import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection, LegalList, MailLink, LEGAL_LINK_CLASS } from "@/components/public/LegalPage";
import { LEGAL_INFO, formatCompanyLine } from "@/lib/legal-info";

export const metadata: Metadata = {
  title: "Política de privacidade | VEXO IA",
  description: "Como o VEXO IA trata os dados de clínicas e de quem conversa com elas no Instagram e no WhatsApp.",
  alternates: { canonical: "/privacidade" },
};

// Escrita a partir do que o código faz (ver PR): Instagram pela API oficial
// (OAuth), WhatsApp via Evolution API (aparelho vinculado), Google Calendar,
// IA via Anthropic e/ou OpenRouter (inclusive transcrição de áudio),
// hospedagem e banco no Railway, tokens cifrados (AES-256-GCM), senhas com
// hash (bcrypt), sem cookies de rastreamento, sem exclusão automática por
// prazo, sem callback de exclusão da Meta (pedido por e-mail).
export default function PrivacyPolicyPage() {
  const companyLine = formatCompanyLine();
  const privacy = LEGAL_INFO.emails.privacy;
  return (
    <LegalPage
      title="Política de privacidade"
      intro={
        <p>
          Esta política explica, em linguagem direta, quais dados o VEXO IA trata, para quê, com quem compartilha e como você
          exerce os seus direitos, conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018, LGPD).
        </p>
      }
    >
      <LegalSection title="1. Quem somos">
        <p>
          O VEXO IA é uma plataforma de atendimento e agendamento para clínicas de saúde. A clínica conecta suas contas e o VEXO
          conversa com as pessoas que entram em contato com ela, agenda consultas e faz os contatos de acompanhamento.
        </p>
        {companyLine && <p>Responsável: {companyLine}.</p>}
        <p>
          Encarregado pelo tratamento de dados (DPO): <MailLink email={privacy} />.
        </p>
        <p>
          Em relação aos dados das pessoas que conversam com uma clínica, a <strong className="font-medium text-vexo-pubFg">clínica é a
          controladora</strong> (decide por que e como os dados são usados) e o VEXO IA atua como <strong className="font-medium text-vexo-pubFg">operador</strong>,
          tratando esses dados em nome dela. Em relação aos dados de quem tem login na plataforma, o VEXO IA é o controlador.
        </p>
      </LegalSection>

      <LegalSection title="2. Quais dados tratamos">
        <p>Da clínica e de quem usa a plataforma:</p>
        <LegalList
          items={[
            "Nome e e-mail de quem tem login; a senha é guardada só em formato de hash, nunca em texto puro.",
            "Informações sobre a clínica fornecidas por ela (serviços, horários, orientações de atendimento, fotos e materiais que ela envia).",
            "Autorizações de acesso às contas conectadas (Instagram e Google Agenda), guardadas cifradas, e o número de WhatsApp vinculado.",
          ]}
        />
        <p>De quem conversa com a clínica no Instagram e no WhatsApp:</p>
        <LegalList
          items={[
            "Identificador da conversa no Instagram, nome, nome de usuário e foto de perfil pública.",
            "Conteúdo das mensagens trocadas, inclusive a transcrição de mensagens de áudio.",
            "Número de telefone, quando a pessoa informa durante a conversa.",
            "Dados de agendamento: data, horário, situação da consulta (marcada, confirmada, compareceu ou faltou) e eventos da agenda da clínica.",
          ]}
        />
        <p>
          A conversa pode conter informações de saúde que a própria pessoa decide contar. Elas são usadas só para o atendimento e o
          agendamento solicitados.
        </p>
      </LegalSection>

      <LegalSection title="3. Para que usamos">
        <LegalList
          items={[
            "Atendimento: responder mensagens em nome da clínica, com apoio de inteligência artificial.",
            "Agendamento: consultar horários livres e marcar a consulta na agenda da clínica, com confirmação pelo WhatsApp.",
            "Follow-up: lembrar antes da consulta e retomar o contato com quem parou de responder ou faltou.",
            "Reativação: contatar pacientes que já foram atendidos, no prazo definido pela clínica.",
            "Relatórios: mostrar à clínica números agregados (abordados, agendamentos, comparecimentos), sem identificar pacientes.",
          ]}
        />
      </LegalSection>

      <LegalSection title="4. Base legal">
        <p>
          Para os dados de quem conversa com a clínica, a base legal é definida pela clínica, como controladora. Em geral, o
          tratamento acontece para executar procedimentos preliminares relacionados ao atendimento pedido pela própria pessoa
          (art. 7º, V, da LGPD), por legítimo interesse da clínica em responder e acompanhar quem a procurou (art. 7º, IX) ou
          com consentimento (art. 7º, I). Dados de saúde são tratados apenas para a finalidade do atendimento (art. 11).
        </p>
        <p>
          Para os dados de quem usa a plataforma, a base legal é a execução do contrato com a clínica (art. 7º, V) e o
          cumprimento de obrigações legais (art. 7º, II).
        </p>
      </LegalSection>

      <LegalSection title="5. Com quem compartilhamos">
        <p>Não vendemos dados. Compartilhamos apenas com os fornecedores necessários para o serviço funcionar:</p>
        <LegalList
          items={[
            "Meta (Instagram): envio e recebimento das mensagens pela API oficial do Instagram, com a autorização da clínica.",
            "WhatsApp: as mensagens saem do número da própria clínica, conectado como aparelho vinculado por meio da Evolution API.",
            "Google: consulta de horários e criação de eventos na agenda da clínica (Google Agenda).",
            "Provedores de inteligência artificial: Anthropic e OpenRouter, que processam o texto das conversas para gerar as respostas e transcrever áudios.",
            "Railway: hospedagem da aplicação e do banco de dados.",
          ]}
        />
      </LegalSection>

      <LegalSection title="6. Uso de inteligência artificial">
        <p>
          As respostas no atendimento são geradas por inteligência artificial a partir das orientações da clínica e do histórico da
          conversa. A equipe da clínica pode acompanhar as conversas, e a IA passa o atendimento para a equipe quando é preciso uma pessoa. Não usamos os dados das
          conversas para treinar modelos próprios.
        </p>
      </LegalSection>

      <LegalSection title="7. Armazenamento, segurança e prazos">
        <LegalList
          items={[
            "A conexão com a plataforma é criptografada (HTTPS).",
            "As autorizações de acesso às contas conectadas ficam cifradas (AES-256-GCM) e as senhas, em hash.",
            "O acesso à plataforma exige login; cada clínica vê apenas os próprios dados.",
          ]}
        />
        <p>
          Mantemos os dados enquanto a clínica usa o VEXO. Quando a conta da clínica é excluída da plataforma, os registros
          vinculados a ela (conversas, contatos, agendamentos) são apagados. Um titular pode pedir a exclusão antes disso (veja a
          seção 9). Dados que precisem ser guardados por obrigação legal ficam retidos apenas pelo prazo exigido.
        </p>
      </LegalSection>

      <LegalSection title="8. Transferência internacional">
        <p>
          Alguns fornecedores listados acima (como Meta, Google, Anthropic e OpenRouter) processam dados em servidores fora do
          Brasil, principalmente nos Estados Unidos. Essas transferências acontecem apenas para prestar o serviço e com
          fornecedores que adotam medidas de segurança compatíveis com a LGPD.
        </p>
      </LegalSection>

      <LegalSection title="9. Seus direitos">
        <p>
          Você pode pedir: confirmação de que tratamos seus dados, acesso, correção, anonimização ou exclusão, portabilidade,
          informação sobre compartilhamento e revogação do consentimento. Escreva para <MailLink email={privacy} />. Se você
          conversou com uma clínica, informe o seu nome de usuário do Instagram (ou telefone) e o nome da clínica. Respondemos em
          até 15 dias. Para exclusão, veja o passo a passo em{" "}
          <Link href="/exclusao-de-dados" className={LEGAL_LINK_CLASS}>
            Exclusão de dados
          </Link>
          .
        </p>
        <p>Você também pode apresentar reclamação à Autoridade Nacional de Proteção de Dados (ANPD).</p>
      </LegalSection>

      <LegalSection title="10. Cookies">
        <p>
          As páginas públicas do VEXO IA não usam cookies de publicidade nem de análise. A plataforma usa apenas cookies
          essenciais para manter o login de quem entra (sessão), sem rastrear a navegação.
        </p>
      </LegalSection>

      <LegalSection title="11. Alterações">
        <p>
          Esta política pode ser atualizada para refletir mudanças no serviço ou na lei. A data no topo indica a versão em vigor.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
