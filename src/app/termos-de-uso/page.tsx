import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Termos de Uso | VEXO",
};

export default function TermsOfUsePage() {
  return (
    <main className="min-h-screen px-4 py-12">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 h-10 w-10 rounded-xl bg-vexo-accent" />
          <h1 className="text-2xl font-semibold tracking-tight">Termos de Uso</h1>
          <p className="mt-1 text-sm text-vexo-muted">VEXO — M8 Growth</p>
        </div>

        <div className="space-y-6 rounded-2xl border border-vexo-border bg-vexo-surface p-6 text-sm leading-relaxed text-vexo-fg shadow-xl sm:p-8">
          <p className="text-vexo-muted">Última atualização: 10 de setembro de 2026.</p>

          <section>
            <h2 className="mb-2 text-base font-semibold">1. Aceitação dos termos</h2>
            <p>
              O VEXO é uma plataforma operada pela M8 Growth, contratada por clínicas de saúde para
              automatizar o atendimento inicial de leads no Instagram com apoio de inteligência
              artificial. Ao acessar ou usar a plataforma — como equipe de uma clínica cliente ou
              como membro da equipe interna da M8 Growth — você concorda com estes Termos de Uso.
              Se não concordar, não utilize a plataforma.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">2. Descrição do serviço</h2>
            <p className="mb-2">A plataforma oferece, entre outras funções:</p>
            <ul className="list-disc space-y-1 pl-5 text-vexo-muted">
              <li>Atendimento automatizado de leads no Direct do Instagram, com apoio de IA;</li>
              <li>Consulta de disponibilidade e criação de agendamentos no Google Calendar da clínica;</li>
              <li>Envio de lembretes e notificações internas por WhatsApp;</li>
              <li>Painel de acompanhamento de métricas e agendamentos para a clínica;</li>
              <li>Ferramentas internas de gestão usadas pela equipe da M8 Growth.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">3. Responsabilidades da clínica cliente</h2>
            <ul className="list-disc space-y-1 pl-5 text-vexo-muted">
              <li>Manter a conta do Instagram, Google Calendar e WhatsApp conectadas e em conformidade com os termos de cada uma dessas plataformas;</li>
              <li>Zelar pela confidencialidade das credenciais de acesso emitidas para sua equipe (ver seção 7 da Política de Privacidade sobre login);</li>
              <li>Garantir que as informações fornecidas pela IA a leads (horários, disponibilidade, condutas) estejam de acordo com a realidade e as políticas da própria clínica — a M8 Growth não se responsabiliza por decisões clínicas ou de saúde, apenas pela automação do atendimento inicial;</li>
              <li>Usar a plataforma apenas para fins lícitos e para a finalidade a que se destina (captação e agendamento de leads via Instagram).</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">4. Uso aceitável</h2>
            <p>
              É vedado usar a plataforma para enviar spam, conteúdo enganoso, discriminatório ou
              ilegal, tentar contornar limites técnicos ou de segurança do sistema, ou acessar dados
              de outra clínica sem autorização. A M8 Growth pode suspender o acesso em caso de uso
              indevido.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">5. Propriedade intelectual</h2>
            <p>
              O software, a marca VEXO e toda a tecnologia por trás da plataforma pertencem à M8
              Growth. O uso da plataforma não transfere nenhum direito de propriedade intelectual à
              clínica cliente — apenas uma licença de uso enquanto durar o contrato entre as partes.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">6. Disponibilidade e limitação de responsabilidade</h2>
            <p>
              A plataforma depende de serviços de terceiros (Meta/Instagram, Google, WhatsApp/Evolution
              API, Anthropic) para funcionar — instabilidades ou mudanças nesses serviços podem afetar
              a disponibilidade do VEXO, sem que isso configure falha da M8 Growth. A M8 Growth
              trabalha para manter o serviço estável, mas não garante operação livre de interrupções, e
              não se responsabiliza por perdas indiretas decorrentes de indisponibilidade, atraso ou
              erro de resposta da IA.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">7. Cancelamento</h2>
            <p>
              A clínica pode encerrar o contrato de uso a qualquer momento, conforme as condições
              comerciais combinadas com a M8 Growth. Após o encerramento, o acesso à plataforma é
              desativado; o tratamento dos dados já coletados segue o descrito na{" "}
              <Link href="/privacidade" className="text-vexo-accent hover:underline">
                Política de Privacidade
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">8. Privacidade e dados</h2>
            <p>
              O tratamento de dados pessoais de leads e de usuários da plataforma é descrito
              separadamente na{" "}
              <Link href="/privacidade" className="text-vexo-accent hover:underline">
                Política de Privacidade
              </Link>
              , que é parte integrante destes Termos de Uso.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">9. Alterações nestes termos</h2>
            <p>
              Estes termos podem ser atualizados periodicamente para refletir mudanças na plataforma
              ou na legislação aplicável. A data no topo desta página indica a versão mais recente.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">10. Contato</h2>
            <p>
              Dúvidas sobre estes Termos de Uso:{" "}
              <a href="mailto:laurafonseca121@gmail.com" className="text-vexo-accent hover:underline">
                laurafonseca121@gmail.com
              </a>
            </p>
          </section>
        </div>

        <p className="mt-6 text-center">
          <Link href="/login" className="text-xs text-vexo-muted hover:text-vexo-fg">
            ← Voltar
          </Link>
        </p>
      </div>
    </main>
  );
}
