import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Exclusão de Dados | VEXO",
};

export default function DataDeletionPage() {
  return (
    <main className="min-h-screen px-4 py-12">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 h-10 w-10 rounded-xl bg-vexo-accent" />
          <h1 className="text-2xl font-semibold tracking-tight">Exclusão de Dados</h1>
          <p className="mt-1 text-sm text-vexo-muted">VEXO — M8 Growth</p>
        </div>

        <div className="space-y-6 rounded-2xl border border-vexo-border bg-vexo-surface p-6 text-sm leading-relaxed text-vexo-fg shadow-xl sm:p-8">
          <section>
            <h2 className="mb-2 text-base font-semibold">Quem pode solicitar</h2>
            <ul className="list-disc space-y-1 pl-5 text-vexo-muted">
              <li>Qualquer pessoa que já trocou mensagens com uma clínica que usa o VEXO no Instagram;</li>
              <li>Qualquer usuário com login na plataforma (equipe interna ou de uma clínica cliente).</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">Como solicitar</h2>
            <p className="mb-3">
              Envie um e-mail para{" "}
              <a href="mailto:laurafonseca121@gmail.com" className="text-vexo-accent hover:underline">
                laurafonseca121@gmail.com
              </a>{" "}
              com o assunto "Exclusão de dados", informando:
            </p>
            <ul className="list-disc space-y-1 pl-5 text-vexo-muted">
              <li>
                Se você é um lead: seu nome de usuário do Instagram e o nome da clínica com quem
                conversou;
              </li>
              <li>Se você tem login na plataforma: o e-mail cadastrado.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">O que é excluído</h2>
            <p>
              Mensagens trocadas, dados de contato (nome, usuário do Instagram, telefone quando
              informado) e, no caso de login na plataforma, os dados da conta. Registros que a
              clínica precise manter por obrigação legal ou contratual (ex: histórico financeiro)
              podem ser retidos apenas pelo tempo exigido por lei.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">Prazo</h2>
            <p>A solicitação é processada em até 15 dias úteis, com confirmação por e-mail.</p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">Mais informações</h2>
            <p>
              Veja também a{" "}
              <Link href="/privacidade" className="text-vexo-accent hover:underline">
                Política de Privacidade
              </Link>{" "}
              completa.
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
