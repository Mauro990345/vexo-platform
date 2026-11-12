import type { ReactNode } from "react";
import { PublicShell } from "@/components/public/PublicShell";
import { LEGAL_INFO } from "@/lib/legal-info";

// Moldura das páginas legais (/privacidade, /termos, /exclusao-de-dados):
// mesmo cabeçalho e rodapé da página pública, conteúdo numa coluna de
// leitura de no máximo 720px.
export function LegalPage({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <PublicShell>
      <article className="mx-auto max-w-[720px] px-4 pb-16 pt-12 sm:px-6 sm:pt-16">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-vexo-pubAccent">VEXO IA</p>
        <h1 className="mt-2 text-pub-h2 md:text-pub-h2-lg">{title}</h1>
        <p className="mt-2 text-sm text-vexo-pubMuted">Última atualização: {LEGAL_INFO.legalUpdatedAt}</p>
        {intro && <div className="mt-5 text-[15px] leading-relaxed text-vexo-pubFg2">{intro}</div>}
        <div className="mt-8 space-y-8">{children}</div>
      </article>
    </PublicShell>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold tracking-tight text-vexo-pubFg">{title}</h2>
      <div className="mt-2 space-y-3 text-[15px] leading-relaxed text-vexo-pubFg2">{children}</div>
    </section>
  );
}

export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 marker:text-vexo-pubMuted">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export function MailLink({ email, subject }: { email: string; subject?: string }) {
  const href = subject ? `mailto:${email}?subject=${encodeURIComponent(subject)}` : `mailto:${email}`;
  return (
    <a href={href} className="text-vexo-pubAccent underline-offset-2 hover:underline">
      {email}
    </a>
  );
}

export const LEGAL_LINK_CLASS = "text-vexo-pubAccent underline-offset-2 hover:underline";
