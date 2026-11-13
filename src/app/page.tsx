import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  CalendarCheck,
  CalendarDays,
  Check,
  KeyRound,
  Link2,
  Mail,
  MessagesSquare,
  Plus,
  RotateCcw,
  Send,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { PublicShell } from "@/components/public/PublicShell";
import { OrbitDiagram } from "@/components/public/OrbitDiagram";
import { VexoLogo, VexoMark } from "@/components/public/VexoLogo";
import { ReportColumnChart, ReportColumnLegend } from "@/components/ReportColumnChart";
import { LEGAL_INFO } from "@/lib/legal-info";
import { FAQ_ITEMS } from "@/components/public/faq-items";

// Página pública do VEXO IA (vexoia.com.br) — pública, sem login, sem
// consultar dado nenhum: todos os números (gráfico, funil em pontos, cartão
// do relatório, conversa) são EXEMPLOS estáticos com selo "Exemplo
// ilustrativo". Ver DESIGN.md, "Página pública".
//
// Princípio (rodada final): a página diz O QUE o VEXO faz, nunca COMO — sem
// canal por função, sem quem faz a primeira mensagem, sem regra de
// reativação nem fluxo interno. Esses detalhes ficam só nas páginas legais.
export const metadata: Metadata = {
  title: "VEXO IA — Social selling para clínicas de saúde",
  description:
    "O VEXO IA atende o paciente, agenda, confirma e traz de volta quem sumiu. Da captação ao agendamento, em um só fluxo, para clínicas de saúde.",
  alternates: { canonical: "/" },
};

const SECTION = "mx-auto max-w-[1040px] px-4 sm:px-6";

// Uma palavra/expressão de cada título em serifa itálica, na cor de
// destaque da seção (escuro: #5db4e6; faixa clara: #2478a8).
function Serif({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return (
    <em className={`font-pub-serif font-normal italic tracking-[-0.01em] ${light ? "text-vexo-pubButton" : "text-vexo-pubAccent"}`}>{children}</em>
  );
}

function Eyebrow({ children, light = false }: { children: string; light?: boolean }) {
  return (
    <p className={`text-[11px] font-medium uppercase tracking-[0.14em] ${light ? "text-vexo-pubLightEyebrow" : "text-vexo-pubAccent"}`}>{children}</p>
  );
}

// Ícone só em traço fino (stroke 1.5, ~30px), sem círculo nem fundo, em cor
// única: #5db4e6 nas seções escuras, #2478a8 nas faixas claras. (Os ícones
// coloridos ficam só na órbita do hero.)
function LineIcon({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return (
    <span className={`inline-flex shrink-0 ${light ? "text-vexo-pubButton" : "text-vexo-pubAccent"}`} aria-hidden="true">
      {children}
    </span>
  );
}

function ExampleTag({ light = false }: { light?: boolean }) {
  return (
    <span
      className={`whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.12em] ${
        light ? "border-vexo-pubLightTitle/10 text-vexo-pubLightText" : "border-vexo-pubEdge/10 text-vexo-pubMuted"
      }`}
    >
      Exemplo ilustrativo
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

const HOW_STEPS: Array<{ n: string; title: string; text: string; icon: ReactNode }> = [
  {
    n: "01",
    title: "Abordagem",
    text: "O contato com quem já se interessa pela clínica é feito por social sellers em conjunto com a IA.",
    icon: <Send size={30} strokeWidth={1.5} />,
  },
  {
    n: "02",
    title: "Condução",
    text: "As dúvidas são respondidas na hora e a conversa é conduzida até a decisão de agendar.",
    icon: <MessagesSquare size={30} strokeWidth={1.5} />,
  },
  {
    n: "03",
    title: "Agendamento",
    text: "O horário é marcado na agenda da clínica e o paciente recebe a confirmação.",
    icon: <CalendarCheck size={30} strokeWidth={1.5} />,
  },
  {
    n: "04",
    title: "Follow-up e reativação",
    text: "Lembretes antes da consulta e um contato no momento certo para o paciente voltar.",
    icon: <RotateCcw size={30} strokeWidth={1.5} />,
  },
];

// Afirmações conferidas no código (PR #219): Instagram pela API oficial da
// Meta; WhatsApp pelo número da clínica pareado como aparelho vinculado
// (Evolution API, NÃO a API oficial); tokens cifrados AES-256-GCM; senhas em
// hash (bcrypt); plataforma só com login; exclusão sob pedido por e-mail.
const SECURITY_ITEMS: Array<{ title: string; text: ReactNode; icon: ReactNode }> = [
  {
    title: "Integrações autorizadas",
    text: "O Instagram é conectado pela API oficial da Meta, com a autorização da própria clínica. O WhatsApp é conectado pelo celular da clínica, como aparelho vinculado.",
    icon: <Link2 size={30} strokeWidth={1.5} />,
  },
  {
    title: "Dados mínimos e protegidos",
    text: "Usamos só as informações necessárias para a conversa e o agendamento. A conexão é criptografada (HTTPS), as chaves de acesso às integrações ficam cifradas e a plataforma só abre com login.",
    icon: <ShieldCheck size={30} strokeWidth={1.5} />,
  },
  {
    title: "Acesso revogável",
    text: "A clínica pode revogar o acesso do VEXO a qualquer momento: no Instagram, pelas configurações da Meta; no WhatsApp, desconectando o aparelho vinculado.",
    icon: <KeyRound size={30} strokeWidth={1.5} />,
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
    icon: <Trash2 size={30} strokeWidth={1.5} />,
  },
];

// Só selos VERDADEIROS segundo o código; nunca certificações que não temos.
const SECURITY_SEALS = ["HTTPS", "Chaves cifradas", "Senhas em hash", "Login obrigatório"];

// Exemplo ILUSTRATIVO e estático (nunca dado de cliente).
const EXAMPLE_MONTHS: Array<{ label: string; values: [number, number] }> = [
  { label: "ago", values: [5, 4] },
  { label: "set", values: [7, 6] },
  { label: "out", values: [10, 8] },
];

// Funil em pontos: 60 pessoas de EXEMPLO (rotulado), pintadas em ordem.
const DOT_GROUPS: Array<{ count: number; className: string; label: string }> = [
  { count: 26, className: "bg-vexo-pubGreen", label: "compareceram" },
  { count: 3, className: "bg-vexo-pubBrand", label: "agendaram e não compareceram" },
  { count: 14, className: "bg-vexo-reportColB", label: "conversaram, sem agendar" },
  { count: 17, className: "bg-vexo-pubEdge/[0.16]", label: "abordados, sem resposta" },
];

const PEEK_METRICS: Array<[string, number]> = [
  ["Abordados", 21],
  ["Em conversa", 15],
  ["Agendaram", 10],
  ["Compareceram", 9],
];

function LightBand({ id, children }: { id: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 px-4 py-6">
      <div className="pub-light-band mx-auto max-w-[1280px] rounded-pub-band py-12 sm:py-16">{children}</div>
    </section>
  );
}

export default function HomePage() {
  const dots = DOT_GROUPS.flatMap((g) => Array.from({ length: g.count }, () => g));
  return (
    <PublicShell>
      {/* Hero */}
      <section className={`${SECTION} pb-4 pt-12 text-center sm:pt-16`}>
        <span className="inline-flex items-center gap-2 rounded-full border border-vexo-pubEdge/10 bg-vexo-pubEdge/[0.03] px-3.5 py-1.5 text-xs text-vexo-pubFg2">
          <span className="h-1.5 w-1.5 rounded-full bg-vexo-pubGreen" aria-hidden="true" />
          Social selling para clínicas de saúde
        </span>
        <h1 className="mx-auto mt-5 max-w-[900px] text-pub-hero text-vexo-pubFg md:text-pub-hero-lg">
          Da captação ao agendamento, <span className="text-vexo-pubAccent">a gente faz tudo por você.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-[560px] text-[15px] leading-relaxed text-vexo-pubFg2">
          O VEXO IA substitui gestor de tráfego, campanhas, CRC e SDR em um só fluxo. Ele atende o paciente, agenda, confirma e
          traz de volta quem sumiu. Sua equipe só atende.
        </p>
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/entrar"
            className="inline-flex items-center gap-2 rounded-full bg-vexo-pubButton px-6 py-2.5 text-[15px] font-medium text-white motion-safe:transition-colors hover:bg-vexo-pubBrand"
          >
            Entrar na plataforma
            <ArrowRight size={16} strokeWidth={1.8} aria-hidden="true" />
          </Link>
          <a
            href="#contato"
            className="inline-flex items-center rounded-full border border-vexo-pubEdge/15 px-6 py-2.5 text-[15px] font-medium text-vexo-pubFg motion-safe:transition-colors hover:border-vexo-pubAccent/50"
          >
            Falar com o VEXO
          </a>
        </div>
      </section>

      {/* Órbita */}
      <section className={`${SECTION} pb-12 pt-6`} aria-label="Como o VEXO se conecta">
        <OrbitDiagram />
      </section>

      {/* Por que o VEXO */}
      <section id="antes-depois" className={`${SECTION} scroll-mt-24 py-12 sm:py-14`}>
        <Eyebrow>Por que o VEXO</Eyebrow>
        <h2 className="mt-2 max-w-[640px] text-pub-h2 md:text-pub-h2-lg">
          Um sistema no lugar de <Serif>quatro funções.</Serif>
        </h2>
        <p className="mt-3 max-w-[560px] text-vexo-pubFg2">
          Gestor de tráfego, campanhas, CRC e SDR, cada um com seu custo e seu ritmo. O VEXO junta tudo em um fluxo único.
        </p>
        <div className="mt-8 grid items-start gap-4 md:grid-cols-[1fr_1.3fr]">
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

          {/* DEPOIS: conversa de exemplo → agendamento confirmado (tons de azul/neutro) */}
          <div className="pub-glow-top rounded-pub-lg border p-5 sm:p-7" style={{ borderColor: "rgb(var(--pub-accent) / 0.34)" }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-vexo-pubAccent">
                  <VexoMark size={16} /> Depois
                </p>
                <h3 className="mt-2 text-lg font-semibold tracking-tight">Um fluxo só, do primeiro contato à consulta.</h3>
              </div>
              <VexoLogo className="hidden shrink-0 opacity-90 sm:inline-flex" markSize={16} />
            </div>

            <div className="mt-5 space-y-2.5 text-sm" role="group" aria-label="Exemplo ilustrativo de conversa com um paciente">
              <p className="mr-auto max-w-[82%] rounded-[18px] rounded-bl-[6px] bg-vexo-pubEdge/[0.08] px-3.5 py-2 text-vexo-pubFg">
                Oi! Queria saber como funciona a avaliação.
              </p>
              <p className="pub-bubble-ai ml-auto max-w-[82%] rounded-[18px] rounded-br-[6px] px-3.5 py-2 text-white">
                Claro! Posso agendar uma avaliação para você. Prefere quinta às 14h ou sexta às 10h?
              </p>
              <p className="mr-auto max-w-[82%] rounded-[18px] rounded-bl-[6px] bg-vexo-pubEdge/[0.08] px-3.5 py-2 text-vexo-pubFg">
                Quinta às 14h.
              </p>
              <div
                className="flex items-center gap-3 rounded-[20px] border p-3"
                style={{
                  backgroundColor: "rgb(var(--pub-bg) / 0.65)",
                  borderColor: "rgb(var(--pub-accent) / 0.45)",
                  boxShadow: "0 0 28px rgb(var(--pub-accent) / 0.10)",
                }}
              >
                <LineIcon>
                  <CalendarDays size={30} strokeWidth={1.5} />
                </LineIcon>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-vexo-pubFg">Avaliação agendada</p>
                  <p className="text-xs text-vexo-pubFg2">Quinta, 14h · confirmação enviada</p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-vexo-pubAccent/15 px-2.5 py-1 text-xs font-medium text-vexo-pubAccent">
                  <Check size={13} strokeWidth={2.2} aria-hidden="true" /> Confirmada
                </span>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {["Lembrete no dia anterior", "Reativação programada"].map((tag) => (
                <span key={tag} className="rounded-full border border-vexo-pubEdge/[0.12] bg-vexo-pubEdge/[0.04] px-3 py-1 text-xs text-vexo-pubFg2">
                  {tag}
                </span>
              ))}
              <span className="ml-auto text-[11px] text-vexo-pubMuted">Exemplo ilustrativo</span>
            </div>
          </div>
        </div>
      </section>

      {/* Como funciona — faixa clara */}
      <LightBand id="como-funciona">
        <div className="mx-auto max-w-[1040px] px-6 sm:px-10">
          <Eyebrow light>Como funciona</Eyebrow>
          <h2 className="mt-2 max-w-[640px] text-pub-h2 text-vexo-pubLightTitle md:text-pub-h2-lg">
            Da primeira mensagem ao <Serif light>retorno do paciente.</Serif>
          </h2>
          <div className="mt-8 grid gap-4 pb-0 md:grid-cols-2 md:pb-7">
            {HOW_STEPS.map((s, i) => (
              <article key={s.n} className={`pub-light-card rounded-pub-sm p-6 ${i % 2 === 1 ? "md:translate-y-7" : ""}`}>
                <div className="flex items-center justify-between">
                  <LineIcon light>{s.icon}</LineIcon>
                  <span className="font-pub-serif text-[40px] italic leading-none text-vexo-pubButton" aria-hidden="true">
                    {s.n}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-semibold tracking-tight text-vexo-pubLightTitle">
                  <span className="sr-only">{s.n}. </span>
                  {s.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-vexo-pubLightText">{s.text}</p>
              </article>
            ))}
          </div>
        </div>
      </LightBand>

      {/* Resultados */}
      <section id="resultados" className={`${SECTION} scroll-mt-24 space-y-4 py-12 sm:py-14`}>
        <div className="pub-block grid items-center gap-8 rounded-pub-lg p-6 sm:p-9 md:grid-cols-[1.1fr_1fr]">
          <div>
            <Eyebrow>Resultados</Eyebrow>
            <h2 className="mt-2 text-pub-h2 md:text-pub-h2-lg">
              Tudo o que a clínica precisa ver, <Serif>em um só lugar.</Serif>
            </h2>
            <p className="mt-3 text-vexo-pubFg2">
              Um painel claro e um relatório automático mostram quantas pessoas foram abordadas, quantas agendaram e quantas
              compareceram.
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
              <ExampleTag />
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

        {/* Funil em pontos — cada ponto é uma pessoa (exemplo fixo) */}
        <div className="pub-block grid items-center gap-8 rounded-pub-lg p-6 sm:p-9 md:grid-cols-[auto_1fr]">
          <div
            className="mx-auto grid w-max grid-cols-12 gap-[9px]"
            role="img"
            aria-label="Exemplo ilustrativo com 60 pessoas abordadas: 26 compareceram, 3 agendaram e não compareceram, 14 conversaram sem agendar e 17 não responderam."
          >
            {dots.map((g, i) => (
              <span key={i} className={`h-2.5 w-2.5 rounded-full ${g.className}`} aria-hidden="true" />
            ))}
          </div>
          <div>
            <Eyebrow>Cada ponto é uma pessoa</Eyebrow>
            <h3 className="mt-2 text-pub-h2">
              Cada pessoa abordada, <Serif>acompanhada até a consulta.</Serif>
            </h3>
            <ul className="mt-4 grid gap-2 text-sm text-vexo-pubFg2 sm:grid-cols-2">
              {DOT_GROUPS.map((g) => (
                <li key={g.label} className="flex items-center gap-2.5">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${g.className}`} aria-hidden="true" />
                  <span>
                    <span className="font-medium text-vexo-pubFg">{g.count}</span> {g.label}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4">
              <ExampleTag />
            </div>
          </div>
        </div>
      </section>

      {/* Segurança e privacidade */}
      <section id="seguranca" className={`${SECTION} scroll-mt-24 py-12 sm:py-14`}>
        <Eyebrow>Segurança e privacidade</Eyebrow>
        <h2 className="mt-2 max-w-[680px] text-pub-h2 md:text-pub-h2-lg">
          Os dados da clínica e dos pacientes, <Serif>sob controle.</Serif>
        </h2>
        <p className="mt-3 max-w-[560px] text-vexo-pubFg2">
          O VEXO usa apenas o necessário para atender e agendar, e só com a autorização da clínica.
        </p>
        <div className="pub-block mt-8 grid overflow-hidden rounded-pub-lg md:grid-cols-2">
          {SECURITY_ITEMS.map((item, i) => (
            <div
              key={item.title}
              className={`p-6 sm:p-7 ${i > 0 ? "border-t border-vexo-pubEdge/[0.08]" : ""} ${i === 1 ? "md:border-t-0" : ""} ${i % 2 === 1 ? "md:border-l md:border-vexo-pubEdge/[0.08]" : ""}`}
            >
              <LineIcon>{item.icon}</LineIcon>
              <h3 className="mt-3 font-semibold tracking-tight">{item.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-vexo-pubFg2">{item.text}</p>
            </div>
          ))}
        </div>
        <ul className="mt-5 flex flex-wrap justify-center gap-2" aria-label="Medidas de segurança">
          {SECURITY_SEALS.map((seal) => (
            <li
              key={seal}
              className="inline-flex items-center gap-1.5 rounded-full border border-vexo-pubEdge/[0.09] px-3 py-1 font-mono text-[12px] uppercase tracking-[0.08em] text-vexo-pubMuted"
            >
              <Check size={12} strokeWidth={2.4} className="text-vexo-pubGreen" aria-hidden="true" />
              {seal}
            </li>
          ))}
        </ul>
      </section>

      {/* Perguntas frequentes — faixa clara */}
      <LightBand id="duvidas">
        <div className="mx-auto grid max-w-[1040px] gap-8 px-6 sm:px-10 md:grid-cols-[0.8fr_1.2fr]">
          <div>
            <Eyebrow light>Dúvidas</Eyebrow>
            <h2 className="mt-2 text-pub-h2 text-vexo-pubLightTitle md:text-pub-h2-lg">
              Perguntas <Serif light>frequentes.</Serif>
            </h2>
            <p className="mt-3 text-vexo-pubLightText">Não achou o que procurava? Fale com o time do VEXO.</p>
            <a
              href={`mailto:${LEGAL_INFO.emails.contact}`}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-vexo-pubButton px-5 py-2.5 text-[15px] font-medium text-white motion-safe:transition-colors hover:bg-vexo-pubBrand"
            >
              <Mail size={16} strokeWidth={1.8} aria-hidden="true" />
              {LEGAL_INFO.emails.contact}
            </a>
          </div>
          <div className="space-y-2.5">
            {FAQ_ITEMS.map((item, i) => (
              <details key={item.q} className="pub-faq pub-light-card group rounded-3xl" open={i === 0}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-[15px] font-medium text-vexo-pubLightTitle">
                  {item.q}
                  <Plus size={18} strokeWidth={1.8} className="pub-faq-plus shrink-0 text-vexo-pubButton motion-safe:transition-transform" aria-hidden="true" />
                </summary>
                <p className="px-5 pb-4 text-sm leading-relaxed text-vexo-pubLightText">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </LightBand>

      {/* Contato — faixa final em degradê, com o relatório "espiando" */}
      <section id="contato" className="scroll-mt-24 px-4 pb-12 pt-10 sm:pb-16">
        <div className="pub-cta-band mx-auto max-w-[1040px] overflow-hidden rounded-pub-cta px-5 pt-[72px] text-center">
          <h2 className="text-pub-h2 text-white md:text-pub-h2-lg">
            Quer ver o VEXO funcionando <em className="font-pub-serif font-normal italic">na sua clínica?</em>
          </h2>
          <p className="mt-3 text-white/[0.92]">Fale com o time do VEXO e receba uma demonstração.</p>
          <a
            href={`mailto:${LEGAL_INFO.emails.contact}`}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-6 py-2.5 text-[15px] font-medium text-vexo-pubLightTitle motion-safe:transition-opacity hover:opacity-90"
          >
            <Mail size={16} strokeWidth={1.8} aria-hidden="true" />
            {LEGAL_INFO.emails.contact}
          </a>

          <div className="relative mx-auto mt-10 h-[210px] max-w-[720px] overflow-hidden" aria-hidden="true">
            <div className="min-h-[280px] rounded-t-[28px] border border-b-0 border-vexo-pubEdge/10 bg-vexo-pubPeek p-5 text-left sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-vexo-pubMuted">Relatório VEXO IA · Outubro de 2026</p>
                <ExampleTag />
              </div>
              <p className="mt-2 text-[15px] text-vexo-pubFg">Em outubro, o VEXO IA abordou 21 pessoas, 10 agendaram e 9 compareceram.</p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {PEEK_METRICS.map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-vexo-pubEdge/[0.08] bg-vexo-pubEdge/[0.03] p-3">
                    <p className="text-[11px] text-vexo-pubMuted">{label}</p>
                    <p className="mt-1 text-2xl font-semibold leading-none text-vexo-pubFg">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
