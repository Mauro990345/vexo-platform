import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidade | VEXO",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen px-4 py-12">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 h-10 w-10 rounded-xl bg-vexo-accent" />
          <h1 className="text-2xl font-semibold tracking-tight">Política de Privacidade</h1>
          <p className="mt-1 text-sm text-vexo-muted">VEXO — M8 Growth</p>
        </div>

        <div className="space-y-6 rounded-2xl border border-vexo-border bg-vexo-surface p-6 text-sm leading-relaxed text-vexo-fg shadow-xl sm:p-8">
          <p className="text-vexo-muted">Última atualização: 2 de setembro de 2026.</p>

          <section>
            <h2 className="mb-2 text-base font-semibold">1. Quem somos</h2>
            <p>
              O VEXO é uma plataforma operada pela M8 Growth que automatiza o atendimento inicial de
              clínicas de saúde no Instagram, com apoio de inteligência artificial. Esta política
              descreve quais dados coletamos, como usamos e como você pode solicitar sua exclusão.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">2. Dados que coletamos</h2>
            <p className="mb-2 font-medium">De pessoas que conversam com uma clínica cliente (leads):</p>
            <ul className="mb-3 list-disc space-y-1 pl-5 text-vexo-muted">
              <li>Nome e nome de usuário do Instagram;</li>
              <li>Conteúdo das mensagens trocadas com a clínica;</li>
              <li>Telefone, apenas quando informado voluntariamente durante a conversa;</li>
              <li>Horários de agendamento marcados.</li>
            </ul>
            <p className="mb-2 font-medium">De pessoas com login na plataforma (equipe da clínica ou da M8 Growth):</p>
            <ul className="mb-3 list-disc space-y-1 pl-5 text-vexo-muted">
              <li>Nome e e-mail;</li>
              <li>Senha, armazenada apenas em formato criptografado (hash) — nunca em texto puro.</li>
            </ul>
            <p className="mb-2 font-medium">Das integrações que a clínica conecta:</p>
            <ul className="list-disc space-y-1 pl-5 text-vexo-muted">
              <li>Tokens de acesso OAuth do Instagram e do Google Calendar, armazenados criptografados;</li>
              <li>Número de WhatsApp usado para notificações internas e lembretes.</li>
            </ul>
            <p className="mt-2 text-vexo-muted">
              Nunca armazenamos a senha da conta do Instagram, do Google ou do WhatsApp de ninguém —
              a conexão é sempre feita pelo mecanismo oficial de autorização de cada plataforma.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">3. Como usamos os dados</h2>
            <ul className="list-disc space-y-1 pl-5 text-vexo-muted">
              <li>Permitir que a IA converse com o lead em nome da clínica e responda dúvidas iniciais;</li>
              <li>Consultar disponibilidade e criar agendamentos no Google Calendar da clínica;</li>
              <li>Enviar lembretes de agendamento e notificações internas (WhatsApp);</li>
              <li>Gerar métricas de desempenho para a clínica acompanhar seus resultados.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">4. Com quem compartilhamos</h2>
            <p>
              Não vendemos dados pessoais. Compartilhamos apenas com os provedores estritamente
              necessários para o funcionamento do serviço, cada um recebendo só o mínimo necessário
              para sua função: Meta (mensageria do Instagram), Google (agenda), Anthropic
              (processamento de linguagem da IA que gera as respostas) e a Evolution API
              (envio de WhatsApp).
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">5. Segurança</h2>
            <p>
              Tokens de integração ficam criptografados em repouso (AES-256). Senhas de login da
              plataforma usam hash — mesmo a equipe da M8 Growth não tem acesso a elas.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">6. Por quanto tempo guardamos os dados</h2>
            <p>
              Enquanto a clínica for cliente ativo da plataforma, ou até que uma solicitação de
              exclusão seja atendida — veja como solicitar na seção seguinte.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">7. Como solicitar a exclusão dos seus dados</h2>
            <p>
              Qualquer lead que já conversou com uma clínica cliente do VEXO, ou qualquer pessoa com
              login na plataforma, pode solicitar a exclusão dos seus dados a qualquer momento.
              Veja o processo completo na{" "}
              <Link href="/exclusao-de-dados" className="text-vexo-accent hover:underline">
                página de exclusão de dados
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">8. Contato</h2>
            <p>
              Dúvidas sobre esta política ou sobre o tratamento dos seus dados:{" "}
              <a href="mailto:privacidade@vexo.com.br" className="text-vexo-accent hover:underline">
                privacidade@vexo.com.br
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
