import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection, LegalList, MailLink, LEGAL_LINK_CLASS } from "@/components/public/LegalPage";
import { LEGAL_INFO } from "@/lib/legal-info";

export const metadata: Metadata = {
  title: "Exclusão de dados | VEXO IA",
  description: "Como pedir a exclusão dos seus dados no VEXO IA.",
  alternates: { canonical: "/exclusao-de-dados" },
};

// Instruções de exclusão de dados (URL de instruções informada à Meta). O app
// NÃO tem endpoint de callback de exclusão da Meta: o pedido é feito por
// e-mail e atendido manualmente — esta página descreve exatamente isso.
export default function DataDeletionPage() {
  const privacy = LEGAL_INFO.emails.privacy;
  return (
    <LegalPage
      title="Exclusão de dados"
      intro={
        <p>
          Qualquer pessoa que conversou com uma clínica que usa o VEXO IA, e qualquer clínica ou pessoa com login na plataforma,
          pode pedir a exclusão dos seus dados a qualquer momento.
        </p>
      }
    >
      <LegalSection title="Como pedir, passo a passo">
        <ol className="list-decimal space-y-2 pl-5 marker:text-vexo-pubMuted">
          <li>
            Envie um e-mail para <MailLink email={privacy} subject="Exclusão de dados" /> com o assunto{" "}
            <strong className="font-medium text-vexo-pubFg">“Exclusão de dados”</strong>.
          </li>
          <li>
            Informe como identificar os seus dados:
            <LegalList
              items={[
                "Se você conversou com uma clínica: o seu nome de usuário do Instagram (ou o telefone usado no WhatsApp) e o nome da clínica.",
                "Se você tem login na plataforma: o e-mail cadastrado.",
                "Se você é a clínica e quer excluir a conta inteira: o nome da clínica e o e-mail do responsável.",
              ]}
            />
          </li>
          <li>Podemos pedir uma confirmação simples de identidade antes de apagar, para proteger os seus dados.</li>
          <li>Você recebe a confirmação por e-mail quando a exclusão for concluída.</li>
        </ol>
      </LegalSection>

      <LegalSection title="Prazo">
        <p>Respondemos em até 15 dias a partir do recebimento do pedido.</p>
      </LegalSection>

      <LegalSection title="O que é apagado">
        <LegalList
          items={[
            "Se você conversou com uma clínica: o seu contato (nome, usuário, foto de perfil, telefone), as mensagens e a transcrição de áudios, e os seus agendamentos registrados no VEXO.",
            "Se você tem login: os dados da sua conta.",
            "Se a clínica encerra a conta: os registros vinculados a ela na plataforma (conversas, contatos, agendamentos, configurações e autorizações de acesso).",
          ]}
        />
        <p>
          Eventos já criados na agenda da clínica (Google Agenda) e mensagens que ficaram no próprio Instagram ou WhatsApp são
          controlados por essas plataformas e pela clínica; podemos orientar como removê-los.
        </p>
      </LegalSection>

      <LegalSection title="O que pode ficar retido">
        <p>
          Apenas o que precisarmos guardar para cumprir obrigação legal ou regulatória, ou para exercer direitos em processos, e só
          pelo prazo exigido. Nesse caso, avisamos na resposta ao seu pedido.
        </p>
      </LegalSection>

      <LegalSection title="Revogar o acesso do VEXO">
        <p>
          A clínica pode, a qualquer momento, remover o acesso do VEXO ao Instagram nas configurações de integrações da Meta e
          desconectar o WhatsApp em “Aparelhos conectados”, no próprio aplicativo.
        </p>
      </LegalSection>

      <LegalSection title="Mais informações">
        <p>
          Veja também a{" "}
          <Link href="/privacidade" className={LEGAL_LINK_CLASS}>
            Política de privacidade
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
