import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireInternalSession } from "@/lib/session";
import { getThemeColors, THEME_FIELDS } from "@/lib/theme";
import { ColorField } from "@/components/ColorField";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { updateThemeSettings, resetThemeSettings } from "./actions";

export const dynamic = "force-dynamic";

// Editor visual das cores do sistema (design tokens) — estilo GHL: cada
// campo é um <input type="color"> com descrição em português simples de
// onde aquilo aparece. Vale pra TODAS as clínicas (ThemeSettings é global,
// não tem clinicId — a lista de campos e valores padrão vive em
// src/lib/theme.ts), mesmo essa tela ficando dentro da rota de uma clínica
// específica na sidebar.
export default async function ClinicConfiguracoesPage({ params }: { params: { id: string } }) {
  await requireInternalSession();

  const clinic = await prisma.clinic.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!clinic) notFound();

  const colors = await getThemeColors();

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-base font-semibold tracking-tight">Configurações</h1>
        <p className="mt-0.5 text-xs text-vexo-muted">
          Cores do sistema. Essas cores valem para o VEXO inteiro — todas as clínicas, não só esta
          — mesmo esse item de menu estando dentro do contexto de uma clínica. Mude o que quiser e
          clique em "Salvar cores"; a mudança aparece em todas as telas na hora.
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
    </div>
  );
}
