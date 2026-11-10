import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ClinicReportContent } from "./ClinicReportContent";
import { computeMonthlyPeriod } from "@/lib/report-period";
import type { ReportNumbersWithComparison } from "@/lib/report-metrics";

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
    followUpRecovered: 3,
    reactivation: { sent: 5, returned: 2 },
    isSimulated: false,
    previousComparison: { contactedPct: 10, inConversationPct: 16, scheduledPct: 25, attendedPct: null },
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

  it("taxa de comparecimento vira uma linha dentro do box 'Compareceram', não um box separado", () => {
    const markup = renderToStaticMarkup(<ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers({ attendanceRate: 0.78 })} />);
    expect(markup).toContain("78% dos agendados");
    expect(markup).not.toContain("Taxa de comparecimento");
  });

  it("'Não compareceram' é um box próprio, logo depois do Resumo", () => {
    const markup = renderToStaticMarkup(<ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers()} />);
    expect(markup).toContain("Não compareceram");
    const resumoIndex = markup.indexOf("Resumo");
    const naoCompareceuIndex = markup.indexOf("Não compareceram");
    expect(naoCompareceuIndex).toBeGreaterThan(resumoIndex);
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

describe("ClinicReportContent — comparação com o período anterior", () => {
  it("mostra a comparação quando há base (ex.: +10% vs. anterior)", () => {
    const markup = renderToStaticMarkup(<ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers({ previousComparison: { contactedPct: 10, inConversationPct: 0, scheduledPct: 0, attendedPct: 0 } })} />);
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
    const markup = renderToStaticMarkup(<ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers({ previousComparison: { contactedPct: -15, inConversationPct: 0, scheduledPct: 0, attendedPct: 0 } })} />);
    expect(markup).toContain("-15% vs. anterior");
  });
});

describe("ClinicReportContent — cor consistente entre os boxes (item 5)", () => {
  it("só 'Agendaram' usa o destaque (vexo-panelHighlight) — nenhum outro box de número usa cor diferente", () => {
    const markup = renderToStaticMarkup(<ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers()} />);
    const highlightCount = markup.split("text-vexo-panelHighlight").length - 1;
    expect(highlightCount).toBe(1);
  });

  it("comparação positiva usa o azul da marca (text-vexo-accent) — mesma regra em qualquer box", () => {
    const markup = renderToStaticMarkup(<ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers({ previousComparison: { contactedPct: 12, inConversationPct: 8, scheduledPct: 5, attendedPct: 20 } })} />);
    const accentCount = markup.split("text-vexo-accent").length - 1;
    expect(accentCount).toBe(4); // os 4 boxes do Resumo, todos com delta positivo
  });

  it("comparação negativa ou nula NUNCA usa o azul (fica cinza, vexo-muted)", () => {
    const markup = renderToStaticMarkup(<ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers({ previousComparison: { contactedPct: -5, inConversationPct: null, scheduledPct: 0, attendedPct: null } })} />);
    expect(markup).not.toContain('class="mt-0.5 text-card text-vexo-accent"');
  });

  it("nenhuma cor vermelha/rosa em lugar nenhum (sem vexo-error, sem classes red-/pink- soltas)", () => {
    const markup = renderToStaticMarkup(<ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers({ previousComparison: { contactedPct: -40, inConversationPct: -30, scheduledPct: -20, attendedPct: -10 } })} />);
    expect(markup).not.toContain("vexo-error");
    expect(markup).not.toMatch(/\bred-\d/);
    expect(markup).not.toMatch(/\bpink-\d/);
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
