import { prisma } from "@/lib/prisma";

// Nomes das variáveis (chave = coluna do ThemeSettings = nome do <input> no
// formulário; cssVar = variável CSS correspondente em globals.css).
export const THEME_COLOR_KEYS = [
  "vexoBg",
  "vexoSurface",
  "vexoSurface2",
  "vexoBorder",
  "vexoBorderStrong",
  "vexoMuted",
  "vexoFg",
  "vexoAccent",
  "vexoAccentFg",
  "vexoPetrol",
  "vexoPetrolBorder",
  "vexoSuccess",
  "vexoError",
  "vexoWarning",
] as const;

export type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number];
export type ThemeColors = Record<ThemeColorKey, string>;

// Precisa bater com os defaults do schema.prisma (ThemeSettings) e com os
// valores originais de src/app/globals.css — é o que a tela de
// Configurações usa pro botão "Restaurar padrão".
export const THEME_DEFAULTS: ThemeColors = {
  vexoBg: "#0b0f17",
  vexoSurface: "#141a24",
  vexoSurface2: "#1b222e",
  vexoBorder: "#232c3a",
  vexoBorderStrong: "#33404f",
  vexoMuted: "#8b96a8",
  vexoFg: "#f1f4f8",
  vexoAccent: "#3b82f6",
  vexoAccentFg: "#ffffff",
  vexoPetrol: "#0B2436",
  vexoPetrolBorder: "#1e4459",
  vexoSuccess: "#34d399",
  vexoError: "#f87171",
  vexoWarning: "#fbbf24",
};

// Metadados usados pela tela de Configurações — cada campo mostra o label e
// a descrição em português simples direto da tabela de referência que já
// foi entregue ao usuário. "cssVar" é a variável em globals.css que esse
// campo controla.
export const THEME_FIELDS: {
  section: string;
  fields: { key: ThemeColorKey; cssVar: string; label: string; description: string }[];
}[] = [
  {
    section: "Fundo geral",
    fields: [
      {
        key: "vexoBg",
        cssVar: "--vexo-bg",
        label: "Fundo principal da aplicação",
        description: "A cor que fica atrás de tudo, o fundo geral de toda tela do sistema.",
      },
      {
        key: "vexoSurface",
        cssVar: "--vexo-surface",
        label: "Fundo dos blocos principais",
        description:
          "Cor de fundo da sidebar (menu lateral) inteira, dos cards da tela Conexões, dos cards de configuração e da maioria das caixas do sistema.",
      },
      {
        key: "vexoSurface2",
        cssVar: "--vexo-surface2",
        label: "Fundo de blocos menores dentro de um card",
        description:
          "Cor de fundo de uma caixinha DENTRO de outro card — por exemplo, as caixas de métricas dentro do card de uma clínica no Painel.",
      },
      {
        key: "vexoBorder",
        cssVar: "--vexo-border",
        label: "Borda padrão",
        description: "Cor das linhas finas ao redor de cards e caixas, usada em quase toda tela do sistema.",
      },
      {
        key: "vexoBorderStrong",
        cssVar: "--vexo-border-strong",
        label: "Borda de destaque",
        description: "Uma borda um pouco mais forte, usada em poucos lugares — por exemplo, ao passar o mouse num card de clínica no Painel.",
      },
    ],
  },
  {
    section: "Texto",
    fields: [
      {
        key: "vexoFg",
        cssVar: "--vexo-fg",
        label: "Texto principal",
        description: "A cor de texto padrão (mais clara) usada no sistema todo — títulos, mensagens, textos normais.",
      },
      {
        key: "vexoMuted",
        cssVar: "--vexo-muted",
        label: "Texto secundário/apagado",
        description:
          "Cor de texto mais fraca, usada em: itens do menu lateral quando NÃO estão selecionados, descrições, legendas e textos de apoio em geral.",
      },
    ],
  },
  {
    section: "Sidebar (menu lateral) e Agenda",
    fields: [
      {
        key: "vexoPetrol",
        cssVar: "--vexo-petrol",
        label: "Fundo do item do menu selecionado / com o mouse em cima",
        description:
          "Cor de fundo quando um item do menu lateral está selecionado OU quando o mouse passa por cima dele. Essa mesma cor também é o fundo dos cards de agendamento na tela Agenda.",
      },
      {
        key: "vexoPetrolBorder",
        cssVar: "--vexo-petrol-border",
        label: "Borda dos cards de agendamento",
        description: "Cor da borda dos cards na tela Agenda — um tom mais claro da cor de fundo acima.",
      },
    ],
  },
  {
    section: "Botões e cor de destaque (marca)",
    fields: [
      {
        key: "vexoAccent",
        cssVar: "--vexo-accent",
        label: "Cor de destaque da marca (azul)",
        description:
          "A cor principal do sistema. Aparece em: fundo do botão primário, borda e texto dos botões secundários, texto do item de menu selecionado, badges \"Novo contato\"/\"Em conversa\", status \"Compareceu\" na Agenda, e em links.",
      },
      {
        key: "vexoAccentFg",
        cssVar: "--vexo-accent-fg",
        label: "Texto em cima da cor de destaque",
        description: "Cor do texto escrito sobre um fundo da cor de destaque acima — por exemplo, o texto do botão primário. Hoje é branco.",
      },
    ],
  },
  {
    section: "Badges e status",
    fields: [
      {
        key: "vexoSuccess",
        cssVar: "--vexo-success",
        label: "Sucesso / positivo",
        description: "Cor verde usada para: bolinha \"conectado\" em Conexões, status \"Agendado\"/\"Confirmado\"/\"Compareceu\" na Agenda, badges de sucesso.",
      },
      {
        key: "vexoError",
        cssVar: "--vexo-error",
        label: "Erro / negativo",
        description: "Cor vermelha usada para: mensagens de erro, status \"Faltou\" na Agenda, badge \"Precisa de humano\", botões de remover/desconectar.",
      },
      {
        key: "vexoWarning",
        cssVar: "--vexo-warning",
        label: "Alerta / atenção",
        description: "Cor amarela usada para: status \"conectando...\" do WhatsApp, badge \"Follow-up\", avisos em geral.",
      },
    ],
  },
];

// Tipografia (fonte e tamanhos) não são cores — não têm seletor de cor
// nesta tela. Ver src/app/globals.css / tailwind.config.ts pra mexer nelas,
// ou pedir pra IA ajustar.

function isValidHex(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

export function hexToRgbTriple(hex: string): string {
  const clean = isValidHex(hex) ? hex : "#000000";
  const r = parseInt(clean.slice(1, 3), 16);
  const g = parseInt(clean.slice(3, 5), 16);
  const b = parseInt(clean.slice(5, 7), 16);
  return `${r} ${g} ${b}`;
}

export async function getThemeColors(): Promise<ThemeColors> {
  // Chamado a partir do layout raiz — roda em toda página do sistema. Se o
  // banco estiver indisponível (ex: durante o build, sem DATABASE_URL),
  // cai pro padrão em vez de derrubar a aplicação inteira.
  let row;
  try {
    row = await prisma.themeSettings.findUnique({ where: { id: "singleton" } });
  } catch {
    return THEME_DEFAULTS;
  }
  if (!row) return THEME_DEFAULTS;

  const colors = { ...THEME_DEFAULTS };
  for (const key of THEME_COLOR_KEYS) {
    const value = row[key];
    if (isValidHex(value)) colors[key] = value;
  }
  return colors;
}

// Vira o objeto de estilo inline aplicado no <html> (ver src/app/layout.tsx)
// — sobrescreve as variáveis CSS padrão de globals.css com o que estiver
// salvo no banco, sem precisar mexer no arquivo CSS em si.
export function buildThemeCssVars(colors: ThemeColors): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const { key, cssVar } of THEME_FIELDS.flatMap((s) => s.fields)) {
    vars[cssVar] = hexToRgbTriple(colors[key]);
  }
  return vars;
}
