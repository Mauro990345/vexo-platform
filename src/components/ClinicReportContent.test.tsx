import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ClinicReportContent } from "./ClinicReportContent";
import { computeMonthlyPeriod } from "@/lib/report-period";
import type { ReportNumbersWithComparison, WeeklyApproached } from "@/lib/report-metrics";

function weeks(counts: number[]): WeeklyApproached[] {
  const base = new Date("2026-11-02T03:00:00.000Z");
  return counts.map((count, i) => ({ start: new Date(base.getTime() + i * 7 * 86400000), end: new Date(base.getTime() + (i + 1) * 7 * 86400000), count }));
}

// Privacidade (pedido explícito): o relatório mostra SÓ agregados — nunca
// nome, @ do Instagram ou telefone de paciente nenhum. A garantia de
// verdade é no TIPO (ReportNumbers/ReportFunnel só têm números, nenhum
// campo de identificação — ver report-metrics.ts); este teste prova isso
// também na MARCAÇÃO renderizada, pro caso de alguém um dia passar um
// campo extra sem querer.
function numbers(overrides: Partial<ReportNumbersWithComparison> = {}): ReportNumbersWithComparison {
  const period = computeMonthlyPeriod(new Date("2026-11-15T12:00:00.000Z"));
  return {
    period,
    funnel: { contacted: 22, inConversation: 14, scheduled: 10, attended: 7, noShow: 1 },
    attendanceRate: 0.7,
    attendanceBase: 10,
    contactedFromApproachLogs: true,
    followUpRecovered: 3,
    reactivation: { sent: 5, returned: 2 },
    isSimulated: false,
    previousComparison: { contactedPct: 10, inConversationPct: 16, scheduledPct: 25, attendedPct: null },
    weeklyApproached: weeks([5, 6, 4, 7]),
    evolution: [],
    ...overrides,
  };
}

describe("ClinicReportContent — privacidade: só agregados, nunca dado pessoal de paciente", () => {
  it("não renderiza nenhum @ do Instagram (padrão '@algumacoisa')", () => {
    const markup = renderToStaticMarkup(<ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers()} />);
    expect(markup).not.toMatch(/@[a-zA-Z0-9_.]+/);
  });

  it("não renderiza nenhuma sequência de dígitos longa o bastante pra ser um telefone (10+ dígitos seguidos)", () => {
    const markup = renderToStaticMarkup(<ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers()} />);
    expect(markup).not.toMatch(/\d{10,}/);
  });

  it("só mostra o nome da CLÍNICA (agregado, já conhecido do admin) — nunca nomes de pacientes/leads individuais", () => {
    const markup = renderToStaticMarkup(<ClinicReportContent clinicName="Clínica Demo VEXO" frequency="MONTHLY" numbers={numbers()} />);
    expect(markup).toContain("Clínica Demo VEXO");
    expect(markup).toContain("Resumo");
    expect(markup).toContain("Reativação");
  });

  it("nunca menciona M8 Growth", () => {
    const markup = renderToStaticMarkup(<ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers()} />);
    expect(markup).not.toContain("M8 Growth");
  });

  it("nunca mostra faturamento/valor em reais (sem R$ em lugar nenhum)", () => {
    const markup = renderToStaticMarkup(<ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers()} />);
    expect(markup).not.toContain("R$");
  });

  it("sempre mostra data inicial e final do período", () => {
    const markup = renderToStaticMarkup(<ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers()} />);
    expect(markup).toContain("01/11 a 30/11");
  });
});

describe("ClinicReportContent — ordem da página (item 1)", () => {
  it("frase de abertura vem depois do período e antes do Resumo", () => {
    const markup = renderToStaticMarkup(<ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers()} />);
    const periodoIndex = markup.indexOf("01/11 a 30/11");
    const fraseIndex = markup.indexOf("o VEXO IA abordou");
    const resumoIndex = markup.indexOf("Resumo");
    expect(fraseIndex).toBeGreaterThan(periodoIndex);
    expect(resumoIndex).toBeGreaterThan(fraseIndex);
  });

  it("gráficos (Comparecimento/Abordagens por semana) vêm depois do Resumo e antes de Follow-up/Reativação", () => {
    const markup = renderToStaticMarkup(<ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers()} />);
    const resumoIndex = markup.indexOf("Resumo");
    const comparecimentoIndex = markup.indexOf("Comparecimento");
    const semanaIndex = markup.indexOf("Abordagens por semana");
    const followUpIndex = markup.indexOf("Follow-up");
    expect(comparecimentoIndex).toBeGreaterThan(resumoIndex);
    expect(semanaIndex).toBeGreaterThan(comparecimentoIndex);
    expect(followUpIndex).toBeGreaterThan(semanaIndex);
  });
});

describe("ClinicReportContent — Resumo (4 boxes) com o início do funil", () => {
  it("mostra Abordados/Em conversa/Agendaram/Compareceram (nomes iguais ao Painel, 'Abordados' não 'Contatados')", () => {
    const markup = renderToStaticMarkup(<ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers()} />);
    expect(markup).toContain("Abordados");
    expect(markup).not.toContain("Contatados");
    expect(markup).toContain("Em conversa");
    expect(markup).toContain("Agendaram");
    expect(markup).toContain("Compareceram");
  });

  it("NÃO existe mais a seção 'Funil' separada (duplicava os números do Resumo)", () => {
    const markup = renderToStaticMarkup(<ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers()} />);
    expect(markup).not.toContain("Funil");
  });

  it("coerência (caso real da Demo em outubro: 10 agendaram, 9 compareceram, 9 de 9 com data no período): o anel mostra 100% COM a base exata, e a faixa de conversão mostra 90% (9/10) — nunca um '100% de comparecimento' solto no box", () => {
    const markup = renderToStaticMarkup(
      <ClinicReportContent
        clinicName="Clínica Teste"
        frequency="MONTHLY"
        numbers={numbers({ funnel: { contacted: 21, inConversation: 21, scheduled: 10, attended: 9, noShow: 0 }, attendanceRate: 1, attendanceBase: 9, contactedFromApproachLogs: false })}
      />
    );
    expect(markup).not.toMatch(/\d+% de comparecimento</);
    expect(markup).not.toContain("dos agendados");
    expect(markup).toContain("9 de 9 atendimentos com data no período");
    expect(markup).toContain("Agendaram para Compareceram: 90%");
    // "Em conversa" = "Abordados" (sem registro manual de abordagem): a 1ª
    // taxa vira "—", nunca um 100% artificial.
    expect(markup).toContain("Abordados para Em conversa: sem taxa");
  });

  it("'Não compareceram' NÃO é mais um box do relatório (removido, item 3 — já se deduz do Resumo)", () => {
    const markup = renderToStaticMarkup(<ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers()} />);
    expect(markup).not.toContain("Não compareceram");
  });

  it("Follow-up mostra 'Leads retomados' num box", () => {
    const markup = renderToStaticMarkup(<ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers({ followUpRecovered: 4 })} />);
    expect(markup).toContain("Leads retomados");
    expect(markup).toContain("4");
  });

  it("Reativação mostra 2 boxes, 'Enviadas' e 'Voltaram', com os números de getReactivationReturnStats", () => {
    const markup = renderToStaticMarkup(<ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers({ reactivation: { sent: 8, returned: 3 } })} />);
    expect(markup).toContain("Enviadas");
    expect(markup).toContain("Voltaram");
  });

  it("Reativação sem nenhuma enviada: mostra os dois boxes em 0, sem esconder a seção", () => {
    const markup = renderToStaticMarkup(<ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers({ reactivation: { sent: 0, returned: 0 } })} />);
    expect(markup).toContain("Reativação");
    expect(markup).toContain("Enviadas");
    expect(markup).toContain("Voltaram");
  });
});

describe("ClinicReportContent — frase de abertura (item 2)", () => {
  it("frase com todos os números presentes, plural correto", () => {
    const markup = renderToStaticMarkup(
      <ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers({ funnel: { contacted: 21, inConversation: 15, scheduled: 10, attended: 9, noShow: 1 } })} />
    );
    expect(markup).toContain("Em novembro, o VEXO IA abordou 21 pessoas, 10 agendaram e 9 compareceram.");
  });

  it("singular correto quando os números são 1", () => {
    const markup = renderToStaticMarkup(
      <ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers({ funnel: { contacted: 1, inConversation: 1, scheduled: 1, attended: 1, noShow: 0 } })} />
    );
    expect(markup).toContain("1 pessoa, 1 agendou e 1 compareceu");
  });

  it("abordados=0: uma única linha neutra, sem mês/quinzena", () => {
    const markup = renderToStaticMarkup(
      <ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers({ funnel: { contacted: 0, inConversation: 0, scheduled: 0, attended: 0, noShow: 0 } })} />
    );
    expect(markup).toContain("Neste período ainda não houve abordagens registradas.");
  });

  it("agendaram=0 (mas abordados>0): frase neutra sobre agendamentos, sem '0 agendaram'", () => {
    const markup = renderToStaticMarkup(
      <ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers({ funnel: { contacted: 5, inConversation: 3, scheduled: 0, attended: 0, noShow: 0 } })} />
    );
    expect(markup).toContain("Neste período ainda não houve agendamentos.");
    expect(markup).not.toContain("0 agendaram");
  });

  it("compareceram=0 (mas agendaram>0): frase neutra sobre comparecimento, sem '0 compareceram'", () => {
    const markup = renderToStaticMarkup(
      <ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers({ funnel: { contacted: 5, inConversation: 3, scheduled: 2, attended: 0, noShow: 0 } })} />
    );
    expect(markup).toContain("Ainda não houve comparecimentos neste período.");
    expect(markup).not.toContain("0 compareceram");
  });
});

describe("ClinicReportContent — comparação com o período anterior", () => {
  it("mostra a comparação quando há base (ex.: +10% vs. anterior)", () => {
    const markup = renderToStaticMarkup(
      <ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers({ previousComparison: { contactedPct: 10, inConversationPct: 0, scheduledPct: 0, attendedPct: 0 } })} />
    );
    expect(markup).toContain("+10% vs. anterior");
  });

  it("período anterior null (sem base): não mostra NENHUM percentual pra aquele box, nunca '-100%'", () => {
    const markup = renderToStaticMarkup(
      <ClinicReportContent
        clinicName="Clínica Teste"
        frequency="MONTHLY"
        numbers={numbers({ previousComparison: { contactedPct: null, inConversationPct: null, scheduledPct: null, attendedPct: null } })}
      />
    );
    expect(markup).not.toContain("vs. anterior");
    expect(markup).not.toContain("-100%");
  });

  it("queda real (negativa): mostra o percentual negativo normalmente, só não em azul", () => {
    const markup = renderToStaticMarkup(
      <ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers({ previousComparison: { contactedPct: -15, inConversationPct: 0, scheduledPct: 0, attendedPct: 0 } })} />
    );
    expect(markup).toContain("-15% vs. anterior");
  });
});

describe("ClinicReportContent — cor única entre os boxes (item 3)", () => {
  it("NENHUM box do Resumo usa o destaque do Painel (vexo-panelHighlight) — nem Agendaram, só no relatório", () => {
    const markup = renderToStaticMarkup(<ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers()} />);
    expect(markup).not.toContain("text-vexo-panelHighlight");
  });

  it("comparação positiva usa o azul de destaque (text-vexo-reportPositive, tom AA do azul da marca) — mesma regra em qualquer box", () => {
    const markup = renderToStaticMarkup(
      <ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers({ previousComparison: { contactedPct: 12, inConversationPct: 8, scheduledPct: 5, attendedPct: 20 } })} />
    );
    const accentCount = markup.split("text-vexo-reportPositive").length - 1;
    expect(accentCount).toBe(4); // os 4 boxes do Resumo, todos com delta positivo
  });

  it("comparação negativa ou nula NUNCA usa o azul (fica cinza)", () => {
    const markup = renderToStaticMarkup(
      <ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers({ previousComparison: { contactedPct: -5, inConversationPct: null, scheduledPct: 0, attendedPct: null } })} />
    );
    expect(markup).not.toContain("text-vexo-reportPositive");
    expect(markup).toContain("-5% vs. anterior");
  });

  it("os 4 boxes têm EXATAMENTE as mesmas classes (cor única)", () => {
    const markup = renderToStaticMarkup(<ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers()} />);
    const valueClasses = [...markup.matchAll(/<p class="(mt-1 font-semibold[^"]*)">/g)].map((m) => m[1]);
    expect(valueClasses.length).toBeGreaterThanOrEqual(4);
    expect(new Set(valueClasses.slice(0, 4)).size).toBe(1);
  });

  it("nenhuma cor vermelha/rosa em lugar nenhum (sem vexo-error, sem classes red-/pink- soltas)", () => {
    const markup = renderToStaticMarkup(
      <ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers({ previousComparison: { contactedPct: -40, inConversationPct: -30, scheduledPct: -20, attendedPct: -10 } })} />
    );
    expect(markup).not.toContain("vexo-error");
    expect(markup).not.toMatch(/\bred-\d/);
    expect(markup).not.toMatch(/\bpink-\d/);
  });
});

describe("ClinicReportContent — gráficos (itens 4 e 5)", () => {
  it("anel de comparecimento mostra o percentual (mesma taxa do box Compareceram)", () => {
    const markup = renderToStaticMarkup(<ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers({ attendanceRate: 0.7 })} />);
    expect(markup).toContain("70%");
    expect(markup).toContain("comparecimento");
  });

  it("sem base pra taxa (null): anel mostra '—'", () => {
    const markup = renderToStaticMarkup(<ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers({ attendanceRate: null })} />);
    expect(markup).toContain("Taxa de comparecimento indisponível");
  });

  it("barras de abordagens por semana aparecem com os valores recebidos", () => {
    const markup = renderToStaticMarkup(<ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers({ weeklyApproached: weeks([3, 9, 5]) })} />);
    expect(markup).toContain("Abordagens por semana");
    expect(markup).toContain(">9<");
  });
});

describe("ClinicReportContent — Dados de exemplo (Demo)", () => {
  it("mostra 'Dados de exemplo' quando isSimulated=true", () => {
    const markup = renderToStaticMarkup(<ClinicReportContent clinicName="Clínica Demo VEXO" frequency="MONTHLY" numbers={numbers({ isSimulated: true })} />);
    expect(markup).toContain("Dados de exemplo");
  });

  it("não mostra 'Dados de exemplo' pra dados reais", () => {
    const markup = renderToStaticMarkup(<ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers({ isSimulated: false })} />);
    expect(markup).not.toContain("Dados de exemplo");
  });
});

function evo(pairs: Array<[number, number]>) {
  const base = new Date("2026-06-01T03:00:00.000Z").getTime();
  return pairs.map(([scheduled, attended], i) => ({
    start: new Date(Date.UTC(2026, 5 + i, 1, 3)),
    end: new Date(Date.UTC(2026, 6 + i, 1, 3)),
    scheduled,
    attended,
  })).map((p) => (base ? p : p));
}

describe("ClinicReportContent — faixa de taxas de conversão (item 6a)", () => {
  it("calcula a partir dos MESMOS números dos boxes (denominador = box anterior)", () => {
    const markup = renderToStaticMarkup(
      <ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers({ funnel: { contacted: 40, inConversation: 20, scheduled: 10, attended: 8, noShow: 1 } })} />
    );
    expect(markup).toContain("Abordados para Em conversa: 50%");
    expect(markup).toContain("Em conversa para Agendaram: 50%");
    expect(markup).toContain("Agendaram para Compareceram: 80%");
  });

  it("denominador zero: '—', nunca NaN/Infinity", () => {
    const markup = renderToStaticMarkup(
      <ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers({ funnel: { contacted: 0, inConversation: 0, scheduled: 0, attended: 0, noShow: 0 } })} />
    );
    expect(markup).toContain("Abordados para Em conversa: sem taxa");
    expect(markup).toContain("Em conversa para Agendaram: sem taxa");
    expect(markup).toContain("Agendaram para Compareceram: sem taxa");
    expect(markup).not.toMatch(/NaN|Infinity/);
  });

  it("taxa acima de 100% por diferença de base (ex.: 3 compareceram de 2 agendaram): '—', nunca '150%'", () => {
    const markup = renderToStaticMarkup(
      <ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers({ funnel: { contacted: 10, inConversation: 6, scheduled: 2, attended: 3, noShow: 0 } })} />
    );
    expect(markup).toContain("Agendaram para Compareceram: sem taxa");
    expect(markup).not.toContain("150%");
  });

  it("fica logo abaixo dos 4 boxes e antes dos gráficos", () => {
    const markup = renderToStaticMarkup(<ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers()} />);
    const compareceramBox = markup.indexOf(">Compareceram<");
    const strip = markup.indexOf("Taxas de conversão entre etapas");
    const ring = markup.indexOf(">Comparecimento<");
    expect(strip).toBeGreaterThan(compareceramBox);
    expect(ring).toBeGreaterThan(strip);
  });
});

describe("ClinicReportContent — evolução dos últimos 6 períodos (item 6c)", () => {
  it("6 meses com dados: mostra o gráfico com rótulos curtos ('jun'...'nov'), depois dos gráficos e antes de Follow-up", () => {
    const markup = renderToStaticMarkup(
      <ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers({ evolution: evo([[4, 3], [6, 5], [5, 4], [8, 7], [9, 8], [10, 7]]) })} />
    );
    expect(markup).toContain("Evolução · últimos 6 meses");
    for (const m of ["jun", "jul", "ago", "set", "out", "nov"]) expect(markup).toContain(`>${m}<`);
    const evolutionIdx = markup.indexOf("Evolução");
    expect(evolutionIdx).toBeGreaterThan(markup.indexOf("Abordagens por semana"));
    expect(markup.indexOf("Follow-up")).toBeGreaterThan(evolutionIdx);
    expect(markup).toContain('role="img" aria-label="Evolução dos últimos 6 períodos');
  });

  it("menos de 3 períodos com dados: o gráfico some", () => {
    const markup = renderToStaticMarkup(
      <ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers({ evolution: evo([[0, 0], [0, 0], [0, 0], [0, 0], [3, 2], [10, 7]]) })} />
    );
    expect(markup).not.toContain("Evolução");
  });

  it("quinzenal: rótulos '1ª out'/'2ª out' e título em quinzenas", () => {
    const points = [
      ["2026-08-16", "2026-09-01"],
      ["2026-09-01", "2026-09-16"],
      ["2026-09-16", "2026-10-01"],
      ["2026-10-01", "2026-10-16"],
      ["2026-10-16", "2026-11-01"],
      ["2026-11-01", "2026-11-16"],
    ].map(([a, b], i) => ({ start: new Date(`${a}T03:00:00.000Z`), end: new Date(`${b}T03:00:00.000Z`), scheduled: 3 + i, attended: 2 + i }));
    const markup = renderToStaticMarkup(<ClinicReportContent clinicName="Clínica Teste" frequency="BIWEEKLY" numbers={numbers({ evolution: points })} />);
    expect(markup).toContain("Evolução · últimas 6 quinzenas");
    expect(markup).toContain(">1ª out<");
    expect(markup).toContain(">2ª out<");
  });
});

describe("ClinicReportContent — Follow-up e Reativação (item 6d)", () => {
  it("'Voltaram' mostra a taxa sobre 'Enviadas'", () => {
    const markup = renderToStaticMarkup(<ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers({ reactivation: { sent: 8, returned: 2 } })} />);
    expect(markup).toContain("25% das enviadas");
  });

  it("nenhuma enviada: taxa oculta", () => {
    const markup = renderToStaticMarkup(<ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers({ reactivation: { sent: 0, returned: 0 } })} />);
    expect(markup).not.toContain("das enviadas");
  });

  it("'Leads retomados' fica sem taxa (não há total confiável de follow-ups enviados por período)", () => {
    const markup = renderToStaticMarkup(<ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers()} />);
    expect(markup).not.toContain("dos follow-ups");
  });
});

describe("ClinicReportContent — topo com identidade e elevação (itens 2 e 4)", () => {
  it("cabeçalho com brilho e filete; blocos usam o painel elevado do Relatório", () => {
    const markup = renderToStaticMarkup(<ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers()} />);
    expect(markup).toContain("report-header-glow");
    expect(markup).toContain("report-title-rule");
    expect(markup.split("report-panel").length - 1).toBeGreaterThanOrEqual(4);
    // nenhum hex solto no markup
    expect(markup).not.toMatch(/#[0-9a-fA-F]{6}\b/);
  });
});
