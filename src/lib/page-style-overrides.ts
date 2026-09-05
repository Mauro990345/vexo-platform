import { prisma } from "@/lib/prisma";
import { THEME_FIELDS, hexToRgbTriple, type ThemeColorKey, type ThemeColors } from "@/lib/theme";

// Registro dos elementos visuais que podem ser "personalizados só nesta
// página" (ver Configurações → seções por página). Cada campo:
// - key: identificador fixo, também é o id da linha em PageStyleOverride
//   quando personalizado (nunca muda depois de criado, senão perde o
//   vínculo com overrides já salvos).
// - cssVar: a variável CSS que esse elemento usa nas classes Tailwind
//   (ver tailwind.config.ts, entradas vexo.pipeline*/vexo.agenda*).
// - followsGlobalKey: qual cor de THEME_FIELDS esse campo segue enquanto
//   ninguém personalizar — é daí que vem o valor mostrado/aplicado por
//   padrão.
export type PageStyleFieldKey =
  | "pipeline.headerFont"
  | "pipeline.cardBackground"
  | "pipeline.cardBorderLeft"
  | "agenda.cardFont"
  | "agenda.cardBackground"
  | "agenda.cardBorderLeft";

export const PAGE_STYLE_SECTIONS: {
  page: string;
  fields: {
    key: PageStyleFieldKey;
    cssVar: string;
    followsGlobalKey: ThemeColorKey;
    label: string;
    description: string;
  }[];
}[] = [
  {
    page: "Pipeline",
    fields: [
      {
        key: "pipeline.headerFont",
        cssVar: "--vexo-pipeline-header-font",
        followsGlobalKey: "vexoFg",
        label: "Fonte do bloco superior",
        description:
          "Cor dos números nos 4 cards de métrica no topo do Pipeline (Novos contatos, Taxa de resposta, Agendados, Taxa de comparecimento).",
      },
      {
        key: "pipeline.cardBackground",
        cssVar: "--vexo-pipeline-card-bg",
        followsGlobalKey: "vexoPetrol",
        label: "Fundo do card de lead",
        description: "Cor de fundo dos cards de lead dentro das colunas do Pipeline (Novo contato, Em conversa, Agendado...).",
      },
      {
        key: "pipeline.cardBorderLeft",
        cssVar: "--vexo-pipeline-card-border",
        followsGlobalKey: "vexoPetrolBorder",
        label: "Borda esquerda do card de lead",
        description: "Cor da barra de destaque na lateral esquerda dos cards de lead do Pipeline.",
      },
    ],
  },
  {
    page: "Agenda",
    fields: [
      {
        key: "agenda.cardFont",
        cssVar: "--vexo-agenda-card-font",
        followsGlobalKey: "vexoFg",
        label: "Cor da fonte",
        description: "Cor do nome do paciente/lead dentro dos cards de agendamento na grade da Agenda.",
      },
      {
        key: "agenda.cardBackground",
        cssVar: "--vexo-agenda-card-bg",
        followsGlobalKey: "vexoPetrol",
        label: "Fundo do card",
        description: "Cor de fundo dos cards de agendamento na grade da Agenda.",
      },
      {
        key: "agenda.cardBorderLeft",
        cssVar: "--vexo-agenda-card-border",
        followsGlobalKey: "vexoPetrolBorder",
        label: "Borda esquerda do card",
        description:
          "Hoje essa borda varia por status (verde=agendado/confirmado, azul=compareceu, vermelho=faltou, cinza=cancelado). Personalizar aqui define UMA cor fixa pra todos os agendamentos, substituindo essa variação por status enquanto estiver ativado.",
      },
    ],
  },
];

const ALL_PAGE_STYLE_FIELDS = PAGE_STYLE_SECTIONS.flatMap((s) => s.fields);

function isValidHex(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

// Mapa key -> valor hex, só das que estão de fato personalizadas (uma
// linha na tabela = personalizado; ausência = segue o global).
export async function getPageStyleOverrides(): Promise<Partial<Record<PageStyleFieldKey, string>>> {
  let rows;
  try {
    rows = await prisma.pageStyleOverride.findMany();
  } catch {
    return {};
  }
  const overrides: Partial<Record<PageStyleFieldKey, string>> = {};
  for (const row of rows) {
    if (isValidHex(row.value)) overrides[row.id as PageStyleFieldKey] = row.value;
  }
  return overrides;
}

// Vira variáveis CSS aplicadas junto das globais (ver buildThemeCssVars) —
// personalizado usa o hex salvo; não-personalizado aponta pra a própria
// variável CSS global correspondente (var() aninhado, resolvido pelo
// navegador), então continua 100% conectado até alguém personalizar.
export function buildPageStyleCssVars(
  overrides: Partial<Record<PageStyleFieldKey, string>>
): Record<string, string> {
  const globalCssVarByKey = Object.fromEntries(
    THEME_FIELDS.flatMap((s) => s.fields).map((f) => [f.key, f.cssVar])
  ) as Record<ThemeColorKey, string>;

  const vars: Record<string, string> = {};
  for (const field of ALL_PAGE_STYLE_FIELDS) {
    const overrideHex = overrides[field.key];
    vars[field.cssVar] = overrideHex ? hexToRgbTriple(overrideHex) : `var(${globalCssVarByKey[field.followsGlobalKey]})`;
  }
  return vars;
}

// Cor efetivamente em uso agora (personalizada ou, na falta dela, a global
// que esse campo segue) — usado só pra preencher o seletor de cor na tela
// de Configurações com um valor sensato ao ligar o toggle pela 1a vez.
export function resolveEffectiveColor(
  field: { key: PageStyleFieldKey; followsGlobalKey: ThemeColorKey },
  overrides: Partial<Record<PageStyleFieldKey, string>>,
  themeColors: ThemeColors
): string {
  return overrides[field.key] ?? themeColors[field.followsGlobalKey];
}
