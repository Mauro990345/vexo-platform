import Link from "next/link";
import { LegalPage, LegalSection, LegalList, MailLink, LEGAL_LINK_CLASS } from "@/components/public/LegalPage";
import { LEGAL_INFO } from "@/lib/legal-info";

// Mesmo conteúdo servido em /termos e /termos-de-uso (rota antiga, mantida
// pra links já cadastrados, ex.: configuração do app na Meta).
export function TermsContent() {
  return (
    <LegalPage
      title="Termos de uso"
      intro={
        <p>
          Estes termos valem para quem usa a plataforma VEXO IA. Ao acessar ou usar a plataforma, você concorda com eles. Se não
          concordar, não use a plataforma.
        </p>
      }
    >
      <LegalSection title="1. O que é o serviço">
        <p>
          O VEXO IA é uma plataforma contratada por clínicas de saúde para atender, com apoio de inteligência artificial, as pessoas
          que entram em contato com a clínica no Instagram, agendar consultas na agenda da clínica, enviar confirmações e contatos
          de acompanhamento pelo WhatsApp e gerar relatórios de resultados.
        </p>
      </LegalSection>

      <LegalSection title="2. Quem pode usar">
        <p>
          A plataforma é destinada a clínicas e profissionais de saúde que contratam o serviço, e às pessoas da equipe autorizadas
          por eles, com login próprio. O acesso é pessoal; cada clínica é responsável pelos logins que libera.
        </p>
      </LegalSection>

      <LegalSection title="3. Responsabilidades da clínica">
        <LegalList
          items={[
            "Ter base legal para tratar os dados de quem conversa com ela e garantir que os contatos tenham autorizado ser contatados (opt-in), especialmente para mensagens de acompanhamento e reativação.",
            "Fornecer informações corretas sobre a clínica, os serviços, os horários e as orientações de atendimento, e revisar o conteúdo das mensagens configuradas.",
            "Cumprir as regras da Meta, do Instagram e do WhatsApp, além das normas profissionais e de publicidade da sua área de saúde.",
            "Não usar a plataforma para spam, conteúdo enganoso, discriminatório ou ilegal, nem tentar contornar limites técnicos ou de segurança.",
            "Manter a equipe acompanhando as conversas e assumir o atendimento quando a IA encaminhar ou quando o caso exigir avaliação profissional.",
          ]}
        />
      </LegalSection>

      <LegalSection title="4. Limites do serviço">
        <p>
          A inteligência artificial pode errar. Ela não faz diagnóstico, não prescreve tratamento e não substitui a avaliação de
          um profissional de saúde. A decisão clínica é sempre da clínica.
        </p>
      </LegalSection>

      <LegalSection title="5. Disponibilidade">
        <p>
          O VEXO IA depende de serviços de terceiros, como Meta (Instagram), WhatsApp, Google e provedores de inteligência
          artificial. Instabilidades ou mudanças nesses serviços podem afetar o funcionamento. Trabalhamos para manter a plataforma
          estável, mas não garantimos operação sem interrupções.
        </p>
      </LegalSection>

      <LegalSection title="6. Propriedade intelectual">
        <p>
          O software, a marca VEXO IA e a tecnologia da plataforma pertencem ao VEXO IA. O uso não transfere direitos de
          propriedade intelectual, apenas uma licença de uso enquanto durar a contratação. O conteúdo e os dados da clínica
          continuam sendo da clínica.
        </p>
      </LegalSection>

      <LegalSection title="7. Cancelamento">
        <p>
          A clínica pode encerrar o uso conforme as condições comerciais combinadas. Com o encerramento, o acesso é desativado e
          as integrações deixam de ser usadas; o destino dos dados segue a{" "}
          <Link href="/privacidade" className={LEGAL_LINK_CLASS}>
            Política de privacidade
          </Link>
          . Podemos suspender o acesso em caso de uso indevido ou violação destes termos.
        </p>
      </LegalSection>

      <LegalSection title="8. Limitação de responsabilidade">
        <p>
          Na extensão permitida pela lei, o VEXO IA não responde por perdas indiretas, lucros cessantes ou danos decorrentes de
          indisponibilidade de serviços de terceiros, de informações incorretas fornecidas pela clínica ou de respostas da IA
          usadas sem revisão quando o caso exigia avaliação profissional.
        </p>
      </LegalSection>

      <LegalSection title="9. Dados pessoais">
        <p>
          O tratamento de dados pessoais está descrito na{" "}
          <Link href="/privacidade" className={LEGAL_LINK_CLASS}>
            Política de privacidade
          </Link>
          , que faz parte destes termos.
        </p>
      </LegalSection>

      <LegalSection title="10. Alterações e foro">
        <p>
          Estes termos podem ser atualizados; a data no topo indica a versão em vigor. Aplica-se a lei brasileira. Fica eleito o
          foro da comarca do domicílio da clínica contratante, salvo disposição diferente no contrato comercial.
        </p>
      </LegalSection>

      <LegalSection title="11. Contato">
        <p>
          Dúvidas sobre estes termos: <MailLink email={LEGAL_INFO.emails.contact} />. Suporte: <MailLink email={LEGAL_INFO.emails.support} />.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
