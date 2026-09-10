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
//   padrão. Alguns campos (ex: o fundo tingido de cada coluna do Pipeline)
//   não seguem nenhuma cor global — não existe um token "azul dessaturado
//   de fundo de card" no tema geral — então usam defaultHex: um valor de
//   partida próprio, pensado pra já nascer sutil/dessaturado nesse mesmo
//   tom escuro, editável do mesmo jeito na tela de Configurações.
export type PageStyleFieldKey =
  | "pipeline.headerFont"
  | "pipeline.column.other.background"
  | "pipeline.column.new.background"
  | "pipeline.column.new.pill"
  | "pipeline.column.conversation.background"
  | "pipeline.column.conversation.pill"
  | "pipeline.column.scheduled.background"
  | "pipeline.column.scheduled.pill"
  | "pipeline.column.followUp.background"
  | "pipeline.column.followUp.pill"
  | "agenda.cardFont"
  | "agenda.status.cancelled.background"
  | "agenda.status.cancelled.pill"
  | "agenda.status.upcoming.background"
  | "agenda.status.upcoming.pill"
  | "agenda.status.completed.background"
  | "agenda.status.completed.pill"
  | "agenda.status.negative.background"
  | "agenda.status.negative.pill";

type PageStyleFieldBase = {
  key: PageStyleFieldKey;
  cssVar: string;
  label: string;
  description: string;
};
export type PageStyleField = PageStyleFieldBase &
  ({ followsGlobalKey: ThemeColorKey; defaultHex?: undefined } | { followsGlobalKey?: undefined; defaultHex: string });

export const PAGE_STYLE_SECTIONS: {
  page: string;
  fields: PageStyleField[];
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
        // Chave nova de propósito (não reaproveita "pipeline.cardBackground",
        // usada até 2026-09 quando esse campo cobria as 6 colunas — uma
        // eventual linha salva sob a chave antiga ficaria órfã em vez de
        // vazar pra esse escopo mais estreito; foi exatamente esse tipo de
        // reaproveitamento de chave que causou o bug do fundo roxo/azul
        // desencontrado na Agenda, ver agenda.status.cancelled.background
        // logo abaixo).
        key: "pipeline.column.other.background",
        cssVar: "--vexo-pipeline-col-other-bg",
        followsGlobalKey: "vexoPetrol",
        label: "Fundo do card de lead (Precisa de humano / Perdido)",
        description:
          "Cor de fundo dos cards de lead nas 2 colunas sem tom próprio (as outras 4 têm campo dedicado logo abaixo).",
      },
      {
        key: "pipeline.column.new.background",
        cssVar: "--vexo-pipeline-col-new-bg",
        defaultHex: "#1d2735",
        label: "Novo contato — fundo do card",
        description: "Cor de fundo (tingida, dessaturada) dos cards de lead na coluna Novo contato.",
      },
      {
        key: "pipeline.column.new.pill",
        cssVar: "--vexo-pipeline-col-new-pill",
        defaultHex: "#2a476f",
        label: "Novo contato — pílula do cabeçalho",
        description: "Cor de fundo do cabeçalho (nome + contador) e da etiqueta de status dentro do card, na coluna Novo contato.",
      },
      {
        key: "pipeline.column.conversation.background",
        cssVar: "--vexo-pipeline-col-conversation-bg",
        defaultHex: "#2c223a",
        label: "Em conversa — fundo do card",
        description: "Cor de fundo (tingida, dessaturada) dos cards de lead na coluna Em conversa.",
      },
      {
        key: "pipeline.column.conversation.pill",
        cssVar: "--vexo-pipeline-col-conversation-pill",
        defaultHex: "#4c3172",
        label: "Em conversa — pílula do cabeçalho",
        description: "Cor de fundo do cabeçalho (nome + contador) e da etiqueta de status dentro do card, na coluna Em conversa.",
      },
      {
        key: "pipeline.column.scheduled.background",
        cssVar: "--vexo-pipeline-col-scheduled-bg",
        defaultHex: "#1c3128",
        label: "Agendado — fundo do card",
        description:
          "Cor de fundo (tingida, dessaturada) dos cards de lead na coluna Agendado — também usada nos cards de métrica \"Agendados\" e \"Taxa de comparecimento\" no topo.",
      },
      {
        key: "pipeline.column.scheduled.pill",
        cssVar: "--vexo-pipeline-col-scheduled-pill",
        defaultHex: "#2b644c",
        label: "Agendado — pílula do cabeçalho",
        description: "Cor de fundo do cabeçalho (nome + contador) e da etiqueta de status dentro do card, na coluna Agendado.",
      },
      {
        key: "pipeline.column.followUp.background",
        cssVar: "--vexo-pipeline-col-followup-bg",
        defaultHex: "#392f1d",
        label: "Follow-up — fundo do card",
        description: "Cor de fundo (tingida, dessaturada) dos cards de lead na coluna Follow-up.",
      },
      {
        key: "pipeline.column.followUp.pill",
        cssVar: "--vexo-pipeline-col-followup-pill",
        defaultHex: "#765b2d",
        label: "Follow-up — pílula do cabeçalho",
        description: "Cor de fundo do cabeçalho (nome + contador) e da etiqueta de status dentro do card, na coluna Follow-up.",
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
        // Chave nova de propósito — RAIZ DO BUG relatado pelo usuário
        // (fundo do card Cancelado ficava azul/desencontrado da etiqueta
        // roxa mesmo em produção, sem cache de nenhum tipo envolvido):
        // esse campo reaproveitava a chave antiga "agenda.cardBackground",
        // que até 2026-09 cobria TODOS os status da Agenda (não só
        // Cancelado). Se alguém já tivesse personalizado essa cor em
        // Configurações ANTES da mudança pra tom-por-status, aquela linha
        // salva no banco continuava vencendo o defaultHex do código pra
        // sempre — só que agora aplicada só no Cancelado, sem ninguém ter
        // pedido isso ali. Uma chave nova zera esse histórico: a linha
        // antiga (se existir) fica órfã/inerte, e o campo nasce limpo.
        key: "agenda.status.cancelled.background",
        cssVar: "--vexo-agenda-status-cancelled-bg",
        defaultHex: "#2a1e38",
        label: "Cancelado — fundo do card",
        description:
          "Cor de fundo dos cards de agendamento cancelado — mesma família de cor (roxo) da etiqueta de status logo abaixo, os dois precisam acompanhar juntos.",
      },
      {
        key: "agenda.status.cancelled.pill",
        cssVar: "--vexo-agenda-status-cancelled-pill",
        defaultHex: "#553678",
        label: "Cancelado — etiqueta de status",
        description: "Cor da etiqueta \"marca-texto\" (nome do status) dentro do card, quando o agendamento foi cancelado.",
      },
      {
        key: "agenda.status.upcoming.background",
        cssVar: "--vexo-agenda-status-upcoming-bg",
        defaultHex: "#29301c",
        label: "Agendado/Confirmado — fundo do card",
        description: "Cor de fundo (tingida, dessaturada) dos cards de agendamento ainda não realizado.",
      },
      {
        key: "agenda.status.upcoming.pill",
        cssVar: "--vexo-agenda-status-upcoming-pill",
        defaultHex: "#546a2f",
        label: "Agendado/Confirmado — etiqueta de status",
        description: "Cor da etiqueta \"marca-texto\" (nome do status) dentro do card, nesses 2 status.",
      },
      {
        key: "agenda.status.completed.background",
        cssVar: "--vexo-agenda-status-completed-bg",
        defaultHex: "#12233b",
        label: "Compareceu — fundo do card",
        description:
          "Cor de fundo dos cards de agendamento com comparecimento confirmado — tom próprio (azul), separado de Agendado/Confirmado (verde) e do Cancelado (roxo), pra diferenciar \"já aconteceu\" de \"ainda vai acontecer\".",
      },
      {
        key: "agenda.status.completed.pill",
        cssVar: "--vexo-agenda-status-completed-pill",
        defaultHex: "#306991",
        label: "Compareceu — etiqueta de status",
        description: "Cor da etiqueta \"marca-texto\" (nome do status) dentro do card, quando o lead compareceu.",
      },
      {
        key: "agenda.status.negative.background",
        cssVar: "--vexo-agenda-status-negative-bg",
        defaultHex: "#37221b",
        label: "Faltou — fundo do card",
        description: "Cor de fundo (tingida, dessaturada) dos cards de agendamento com falta.",
      },
      {
        key: "agenda.status.negative.pill",
        cssVar: "--vexo-agenda-status-negative-pill",
        defaultHex: "#77402c",
        label: "Faltou — etiqueta de status",
        description: "Cor da etiqueta \"marca-texto\" (nome do status) dentro do card, quando o lead faltou.",
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
    if (overrideHex) {
      vars[field.cssVar] = hexToRgbTriple(overrideHex);
    } else if (field.followsGlobalKey) {
      vars[field.cssVar] = `var(${globalCssVarByKey[field.followsGlobalKey]})`;
    } else {
      vars[field.cssVar] = hexToRgbTriple(field.defaultHex);
    }
  }
  return vars;
}

// Cor efetivamente em uso agora (personalizada, ou na falta dela a global
// que esse campo segue, ou o defaultHex do próprio campo quando não segue
// nenhuma) — usado só pra preencher o seletor de cor na tela de
// Configurações com um valor sensato ao ligar o toggle pela 1a vez.
export function resolveEffectiveColor(
  field: PageStyleField,
  overrides: Partial<Record<PageStyleFieldKey, string>>,
  themeColors: ThemeColors
): string {
  if (overrides[field.key]) return overrides[field.key] as string;
  return field.followsGlobalKey ? themeColors[field.followsGlobalKey] : field.defaultHex;
}

// Texto mostrado ao lado do valor quando o campo NÃO está personalizado —
// "seguindo X" pra quem segue uma cor global, ou um rótulo genérico pros
// campos com valor de partida próprio (sem global equivalente).
export function followsLabelFor(
  field: PageStyleField,
  globalFieldLabelByKey: Record<ThemeColorKey, string>
): string {
  return field.followsGlobalKey ? globalFieldLabelByKey[field.followsGlobalKey] : "valor inicial sugerido";
}
