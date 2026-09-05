import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireInternalSession } from "@/lib/session";
import { getThemeColors, THEME_FIELDS, type ThemeColorKey } from "@/lib/theme";
import { PAGE_STYLE_SECTIONS, getPageStyleOverrides, resolveEffectiveColor } from "@/lib/page-style-overrides";
import { ColorField } from "@/components/ColorField";
import { PageStyleColorField } from "@/components/PageStyleColorField";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { updateThemeSettings, resetThemeSettings, updatePageStyleOverrides } from "./actions";
import { updateAiSettings } from "@/app/crm/(global)/follow-up/actions";

export const dynamic = "force-dynamic";

// Configurações GLOBAIS do sistema — timing de resposta da IA (as 2
// faixas fixas + o toggle geral), cores do sistema, cores por página.
// Tudo aqui vale pro VEXO inteiro (todas as clínicas), não só a que está
// selecionada no momento — mesmo essa tela ficando dentro da rota de uma
// clínica específica na sidebar. Configs realmente por-clínica (prompt da
// IA, vídeo de boas-vindas, WhatsApp de alerta, e também o delay da
// faixa "até 1h" — cada clínica pode querer um tom de primeira resposta
// diferente) NÃO estão aqui — ficam em "Agente de IA".
export default async function ClinicConfiguracoesPage({ params }: { params: { id: string } }) {
  await requireInternalSession();

  const [clinic, aiSettings] = await Promise.all([
    prisma.clinic.findUnique({ where: { id: params.id }, select: { id: true } }),
    prisma.aiSettings.findUnique({ where: { id: "singleton" } }),
  ]);
  if (!clinic) notFound();

  const adaptiveDelayEnabled = aiSettings?.adaptiveDelayEnabled ?? true;

  const colors = await getThemeColors();
  const pageStyleOverrides = await getPageStyleOverrides();
  const globalFieldLabelByKey = Object.fromEntries(
    THEME_FIELDS.flatMap((s) => s.fields).map((f) => [f.key, f.label])
  ) as Record<ThemeColorKey, string>;

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-base font-semibold tracking-tight">Configurações</h1>
        <p className="mt-0.5 text-xs text-vexo-muted">
          Configurações globais do VEXO — valem para todas as clínicas, não só esta, mesmo esse
          item de menu estando dentro do contexto de uma clínica específica.
        </p>
      </div>

      <section className="space-y-2.5">
        <div>
          <h2 className="text-sm font-semibold">Timing de resposta da IA</h2>
          <p className="mt-1 text-xs text-vexo-muted">
            Controla quanto tempo a IA espera pra responder, de acordo com o tempo de silêncio do
            lead desde a última mensagem dela.
          </p>
          <ul className="mt-1.5 space-y-0.5 text-xs text-vexo-muted">
            <li>• até 1 hora sem resposta: 30-60 segundos (ajustável por clínica, ver "Agente de IA" de cada uma)</li>
            <li>• de 1 a 6 horas: 5-10 minutos — fixo, vale pra todas as clínicas</li>
            <li>• mais de 6 horas: 2-5 minutos — fixo, vale pra todas as clínicas</li>
          </ul>
        </div>

        <form
          action={updateAiSettings}
          className="flex items-center justify-between gap-3 rounded-xl border border-vexo-border bg-vexo-surface p-3.5"
        >
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              name="adaptiveDelayEnabled"
              defaultChecked={adaptiveDelayEnabled}
              className="h-3.5 w-3.5 shrink-0 rounded border-vexo-border"
            />
            Delay adaptativo ativado (vale pra todas as clínicas)
          </label>
          <button
            type="submit"
            className="shrink-0 rounded-lg border border-vexo-accent px-2.5 py-1.5 text-card font-medium text-vexo-accent hover:bg-vexo-accent/10"
          >
            Salvar
          </button>
        </form>
      </section>

      <div className="border-t border-vexo-border pt-4">
        <h2 className="text-sm font-semibold">Cores do sistema</h2>
        <p className="mt-0.5 text-xs text-vexo-muted">
          Mude o que quiser e clique em "Salvar cores"; a mudança aparece em todas as telas na
          hora.
        </p>
      </div>

      <form action={updateThemeSettings} className="space-y-5">
        {THEME_FIELDS.map((section) => (
          <section key={section.section} className="space-y-2">
            <h2 className="text-sm font-semibold">{section.section}</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {section.fields.map((field) => (
                <ColorField
                  key={field.key}
                  name={field.key}
                  defaultValue={colors[field.key]}
                  label={field.label}
                  description={field.description}
                />
              ))}
            </div>
          </section>
        ))}

        <p className="text-card text-vexo-muted">
          Fonte e tamanhos de texto (tipografia) não são cores — não têm seletor aqui. Se quiser
          mudar a fonte do sistema ou o tamanho de algum texto, é só pedir.
        </p>

        <div className="flex items-center gap-2 border-t border-vexo-border pt-3">
          <button
            type="submit"
            className="rounded-lg bg-vexo-accent px-3 py-1.5 text-sm font-medium text-vexo-accentFg hover:opacity-90"
          >
            Salvar cores
          </button>
        </div>
      </form>

      <form action={resetThemeSettings} className="border-t border-vexo-border pt-3">
        <ConfirmSubmitButton
          confirmMessage="Restaurar todas as cores para o padrão de fábrica? Isso desfaz qualquer ajuste feito nesta tela."
          className="rounded-lg border border-vexo-error px-3 py-1.5 text-xs font-medium text-vexo-error hover:bg-vexo-error/10"
        >
          Restaurar cores padrão
        </ConfirmSubmitButton>
      </form>

      <div className="border-t border-vexo-border pt-4">
        <h2 className="text-sm font-semibold">Cores por página</h2>
        <p className="mt-0.5 text-xs text-vexo-muted">
          Cada elemento abaixo segue a cor geral do sistema (acima) por padrão. Ative "Personalizar
          só nesta página" num campo específico pra dar a ele uma cor própria, independente do
          resto — sem mexer em mais nada. Se você nunca ligar nenhum toggle, tudo continua
          conectado como sempre foi.
        </p>
      </div>

      <form action={updatePageStyleOverrides} className="space-y-5">
        {PAGE_STYLE_SECTIONS.map((section) => (
          <section key={section.page} className="space-y-2">
            <h2 className="text-sm font-semibold">{section.page}</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {section.fields.map((field) => (
                <PageStyleColorField
                  key={field.key}
                  name={field.key}
                  label={field.label}
                  description={field.description}
                  followsLabel={globalFieldLabelByKey[field.followsGlobalKey]}
                  currentColor={resolveEffectiveColor(field, pageStyleOverrides, colors)}
                  initiallyOverridden={Boolean(pageStyleOverrides[field.key])}
                />
              ))}
            </div>
          </section>
        ))}

        <div className="flex items-center gap-2 border-t border-vexo-border pt-3">
          <button
            type="submit"
            className="rounded-lg bg-vexo-accent px-3 py-1.5 text-sm font-medium text-vexo-accentFg hover:opacity-90"
          >
            Salvar cores por página
          </button>
        </div>
      </form>
    </div>
  );
}
