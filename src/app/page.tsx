import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowRight, Check, KeyRound, Link2, MessagesSquare, Send, ShieldCheck, Trash2, CalendarCheck, RotateCcw } from "lucide-react";
import { PublicShell } from "@/components/public/PublicShell";
import { OrbitDiagram } from "@/components/public/OrbitDiagram";
import { ReportColumnChart, ReportColumnLegend } from "@/components/ReportColumnChart";
import { LEGAL_INFO } from "@/lib/legal-info";

// Página pública do VEXO IA (vexoia.com.br) — pública, sem login, sem
// consultar dado nenhum (os números do gráfico de "Resultados" são um
// exemplo ESTÁTICO). O login fica em /entrar. Ver DESIGN.md, "Página pública".
export const metadata: Metadata = {
  title: "VEXO IA — Social selling para clínicas de saúde",
  description:
    "O VEXO IA conversa com quem segue a clínica no Instagram, agenda o paciente, confirma pelo WhatsApp e traz de volta quem sumiu. Da captação ao agendamento, em um só fluxo.",
  alternates: { canonical: "/" },
};

const SECTION = "mx-auto max-w-[1040px] px-4 sm:px-6";

function Eyebrow({ children }: { children: string }) {
  return <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-vexo-pubAccent">{children}</p>;
}

function IconBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-vexo-pubEdge/10 bg-vexo-pubEdge/[0.04] text-vexo-pubAccent" aria-hidden="true">
      {children}
    </span>
  );
}

const BEFORE_PILLS: Array<{ label: string; rotate: string }> = [
  { label: "Gestor de tráfego", rotate: "-rotate-3" },
  { label: "Campanhas", rotate: "rotate-2" },
  { label: "CRC", rotate: "-rotate-1" },
  { label: "SDR", rotate: "rotate-3" },
  { label: "Planilhas", rotate: "-rotate-2" },
  { label: "WhatsApp manual", rotate: "rotate-1" },
  { label: "Leads esquecidos", rotate: "-rotate-3" },
];

const AFTER_STEPS = [
  "Captação e primeira abordagem",
  "Conversa conduzida pela IA",
  "Agendamento e confirmação",
  "Follow-up, reativação e relatório",
];

const HOW_STEPS: Array<{ n: string; title: string; text: string; icon: React.ReactNode; corner: string }> = [
  {
    n: "01",
    title: "Abordagem",
    text: "A primeira mensagem sai de uma pessoa da equipe, de forma humana, para quem já segue a clínica no Instagram.",
    icon: <Send size={16} strokeWidth={1.7} />,
    corner: "var(--tab-icon-1)",
  },
  {
    n: "02",
    title: "Condução",
    text: "Quando o paciente responde, a IA assume, tira dúvidas e conduz até a decisão de agendar.",
    icon: <MessagesSquare size={16} strokeWidth={1.7} />,
    corner: "var(--tab-icon-2)",
  },
  {
    n: "03",
    title: "Agendamento",
    text: "O horário é marcado na agenda da clínica e o paciente recebe a confirmação pelo WhatsApp.",
    icon: <CalendarCheck size={16} strokeWidth={1.7} />,
    corner: "var(--tab-icon-3)",
  },
  {
    n: "04",
    title: "Follow-up e reativação",
    text: "Lembretes antes da consulta e um contato no momento certo para o paciente voltar, no prazo que a clínica definir.",
    icon: <RotateCcw size={16} strokeWidth={1.7} />,
    corner: "var(--tab-icon-4)",
  },
];

// Afirmações conferidas no código (ver relatório da PR): Instagram pela API
// oficial da Meta (OAuth da própria clínica); WhatsApp NÃO é pela API oficial
// — é o número da clínica pareado como aparelho vinculado (Evolution API),
// por isso o texto não diz "meios oficiais" pro WhatsApp. Tokens de
// integração cifrados (AES-256-GCM), senhas com hash, acesso só com login.
const SECURITY_ITEMS: Array<{ title: string; text: React.ReactNode; icon: React.ReactNode }> = [
  {
    title: "Integrações autorizadas",
    text: "O Instagram é conectado pela API oficial da Meta, com a autorização da própria clínica. O WhatsApp é conectado pelo celular da clínica, como aparelho vinculado.",
    icon: <Link2 size={16} strokeWidth={1.7} />,
  },
  {
    title: "Dados mínimos e protegidos",
    text: "Usamos só as informações necessárias para a conversa e o agendamento. A conexão é criptografada (HTTPS), as chaves de acesso às integrações ficam cifradas e a plataforma só abre com login.",
    icon: <ShieldCheck size={16} strokeWidth={1.7} />,
  },
  {
    title: "Acesso revogável",
    text: "A clínica pode revogar o acesso do VEXO a qualquer momento: no Instagram, pelas configurações da Meta; no WhatsApp, desconectando o aparelho vinculado.",
    icon: <KeyRound size={16} strokeWidth={1.7} />,
  },
  {
    title: "Exclusão de dados",
    text: (
      <>
        É possível solicitar a exclusão a qualquer momento.{" "}
        <Link href="/exclusao-de-dados" className="text-vexo-pubAccent underline-offset-2 hover:underline">
          Veja como solicitar
        </Link>
        .
      </>
    ),
    icon: <Trash2 size={16} strokeWidth={1.7} />,
  },
];

// Exemplo ILUSTRATIVO e estático (nunca dado de cliente).
const EXAMPLE_MONTHS: Array<{ label: string; values: [number, number] }> = [
  { label: "ago", values: [5, 4] },
  { label: "set", values: [7, 6] },
  { label: "out", values: [10, 8] },
];

export default function HomePage() {
  return (
    <PublicShell>
      {/* Hero */}
      <section className={`${SECTION} pb-6 pt-14 text-center sm:pt-20`}>
        <span className="inline-flex items-center gap-2 rounded-full border border-vexo-pubEdge/10 bg-vexo-pubEdge/[0.03] px-3.5 py-1.5 text-xs text-vexo-pubFg2">
          <span className="h-1.5 w-1.5 rounded-full bg-vexo-pubGreen" aria-hidden="true" />
          Social selling para clínicas de saúde
        </span>
        <h1 className="mx-auto mt-5 max-w-[880px] text-pub-hero text-vexo-pubFg md:text-pub-hero-lg">
          Da captação ao agendamento, <span className="text-vexo-pubAccent">a gente faz tudo por você.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-[620px] text-base leading-relaxed text-vexo-pubFg2 sm:text-lg">
          O VEXO IA substitui gestor de tráfego, campanhas, CRC e SDR em um só fluxo. Ele conversa no Instagram e no WhatsApp,
          agenda o paciente e traz de volta quem sumiu. Sua equipe só atende.
        </p>
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/entrar"
            className="inline-flex items-center gap-2 rounded-full bg-vexo-pubButton px-6 py-2.5 text-sm font-medium text-white motion-safe:transition-colors hover:bg-vexo-pubBrand"
          >
            Entrar na plataforma
            <ArrowRight size={16} strokeWidth={1.8} aria-hidden="true" />
          </Link>
          <a
            href="#contato"
            className="inline-flex items-center rounded-full border border-vexo-pubEdge/15 px-6 py-2.5 text-sm font-medium text-vexo-pubFg motion-safe:transition-colors hover:border-vexo-pubAccent/50"
          >
            Falar com o VEXO
          </a>
        </div>
      </section>

      {/* Órbita */}
      <section className={`${SECTION} pb-14 pt-6`} aria-label="Como o VEXO se conecta">
        <OrbitDiagram />
      </section>

      {/* Por que o VEXO */}
      <section id="antes-depois" className={`${SECTION} scroll-mt-24 py-12 sm:py-16`}>
        <Eyebrow>Por que o VEXO</Eyebrow>
        <h2 className="mt-2 max-w-[640px] text-pub-h2 md:text-pub-h2-lg">Um sistema no lugar de quatro funções.</h2>
        <p className="mt-3 max-w-[560px] text-vexo-pubFg2">
          Gestor de tráfego, campanhas, CRC e SDR, cada um com seu custo e seu ritmo. O VEXO junta tudo em um fluxo único.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-[1fr_1.2fr]">
          <div className="pub-block rounded-pub p-6 sm:p-7">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-vexo-pubMuted">Antes</p>
            <ul className="mt-5 flex flex-wrap gap-2.5" aria-label="Antes do VEXO">
              {BEFORE_PILLS.map((p) => (
                <li
                  key={p.label}
                  className={`${p.rotate} rounded-full border border-vexo-pubEdge/10 bg-vexo-pubEdge/[0.04] px-3.5 py-1.5 text-sm text-vexo-pubFg2`}
                >
                  {p.label}
                </li>
              ))}
            </ul>
          </div>
          <div className="pub-glow-top rounded-pub-lg border p-6 sm:p-7" style={{ borderColor: "rgb(var(--pub-accent) / 0.28)" }}>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-vexo-pubAccent">Depois</p>
            <ol className="mt-4 space-y-3">
              {AFTER_STEPS.map((step, i) => (
                <li key={step} className="flex items-center gap-3">
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-vexo-pubAccent/40 text-xs font-medium text-vexo-pubAccent">
                    {i + 1}
                  </span>
                  <span className="text-vexo-pubFg">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" className={`${SECTION} scroll-mt-24 py-12 sm:py-16`}>
        <Eyebrow>Como funciona</Eyebrow>
        <h2 className="mt-2 max-w-[640px] text-pub-h2 md:text-pub-h2-lg">Da primeira mensagem ao retorno do paciente.</h2>
        <div className="mt-8 space-y-4">
          {[HOW_STEPS.slice(0, 2), HOW_STEPS.slice(2, 4)].map((row, ri) => (
            <div key={ri} className={`grid gap-4 ${ri === 0 ? "md:grid-cols-[1.25fr_1fr]" : "md:grid-cols-[1fr_1.25fr]"}`}>
              {row.map((s) => (
                <article
                  key={s.n}
                  className="pub-block pub-glow-corner rounded-pub p-6"
                  style={{ "--pub-corner": s.corner } as CSSProperties}
                >
                  <div className="flex items-center gap-3">
                    <IconBadge>{s.icon}</IconBadge>
                    <span className="text-xs font-medium tracking-[0.1em] text-vexo-pubMuted">{s.n}</span>
                  </div>
                  <h3 className="mt-4 text-lg font-semibold tracking-tight">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-vexo-pubFg2">{s.text}</p>
                </article>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* Resultados */}
      <section id="resultados" className={`${SECTION} scroll-mt-24 py-12 sm:py-16`}>
        <div className="pub-block grid items-center gap-8 rounded-pub-lg p-6 sm:p-9 md:grid-cols-[1.1fr_1fr]">
          <div>
            <Eyebrow>Resultados</Eyebrow>
            <h2 className="mt-2 text-pub-h2 md:text-pub-h2-lg">Tudo o que a clínica precisa ver, em um só lugar.</h2>
            <p className="mt-3 text-vexo-pubFg2">
              Um painel claro e um relatório automático pelo WhatsApp mostram quantas pessoas foram abordadas, quantas agendaram e
              quantas compareceram.
            </p>
            <ul className="mt-5 space-y-2.5">
              {["Relatório quinzenal ou mensal, sem precisar pedir", "Comparação com o período anterior", "Números de follow-up e reativação"].map(
                (item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-vexo-pubFg">
                    <Check size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-vexo-pubGreen" aria-hidden="true" />
                    {item}
                  </li>
                )
              )}
            </ul>
          </div>
          <figure className="report-panel-raised rounded-pub-sm p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-vexo-tabFg">Evolução · últimos 3 meses</p>
              <span className="rounded-full border border-vexo-pubEdge/10 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-vexo-pubMuted">
                Exemplo ilustrativo
              </span>
            </div>
            <p className="mt-1.5 text-[12px] text-vexo-reportCaption">
              Agendamentos: 10 em outubro, <span className="text-vexo-pubGreen">+43%</span> sobre setembro
            </p>
            <ReportColumnChart
              groups={EXAMPLE_MONTHS}
              ariaLabel="Exemplo ilustrativo de evolução — agosto: 5 agendaram, 4 compareceram; setembro: 7 agendaram, 6 compareceram; outubro: 10 agendaram, 8 compareceram"
            />
            <div className="mt-2 border-t border-vexo-pubEdge/[0.06] pt-2">
              <ReportColumnLegend seriesLabels={["Agendaram", "Compareceram"]} />
            </div>
          </figure>
        </div>
      </section>

      {/* Segurança e privacidade */}
      <section id="seguranca" className={`${SECTION} scroll-mt-24 py-12 sm:py-16`}>
        <Eyebrow>Segurança e privacidade</Eyebrow>
        <h2 className="mt-2 max-w-[680px] text-pub-h2 md:text-pub-h2-lg">Os dados da clínica e dos pacientes, sob controle.</h2>
        <p className="mt-3 max-w-[560px] text-vexo-pubFg2">
          O VEXO usa apenas o necessário para atender e agendar, e só com a autorização da clínica.
        </p>
        <div className="pub-block mt-8 grid overflow-hidden rounded-pub-lg md:grid-cols-2">
          {SECURITY_ITEMS.map((item, i) => (
            <div
              key={item.title}
              className={`p-6 sm:p-7 ${i > 0 ? "border-t border-vexo-pubEdge/[0.08]" : ""} ${i === 1 ? "md:border-t-0" : ""} ${i % 2 === 1 ? "md:border-l md:border-vexo-pubEdge/[0.08]" : ""}`}
            >
              <IconBadge>{item.icon}</IconBadge>
              <h3 className="mt-3 font-semibold tracking-tight">{item.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-vexo-pubFg2">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Contato */}
      <section id="contato" className={`${SECTION} scroll-mt-24 pb-16 pt-12 sm:pb-20 sm:pt-16`}>
        <div className="pub-block pub-glow-top mx-auto max-w-[760px] rounded-pub-lg px-6 py-10 text-center sm:px-10">
          <h2 className="text-pub-h2 md:text-pub-h2-lg">Quer ver o VEXO funcionando na sua clínica?</h2>
          <p className="mt-3 text-vexo-pubFg2">Fale com o time do VEXO e receba uma demonstração.</p>
          <a
            href={`mailto:${LEGAL_INFO.emails.contact}`}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-vexo-pubButton px-6 py-2.5 text-sm font-medium text-white motion-safe:transition-colors hover:bg-vexo-pubBrand"
          >
            Falar com o VEXO
            <ArrowRight size={16} strokeWidth={1.8} aria-hidden="true" />
          </a>
          <p className="mt-3 text-xs text-vexo-pubMuted">{LEGAL_INFO.emails.contact}</p>
        </div>
      </section>
    </PublicShell>
  );
}
