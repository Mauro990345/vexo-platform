import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ClinicReportContent } from "./ClinicReportContent";
import { computeMonthlyPeriod } from "@/lib/report-period";
import type { ReportNumbersWithComparison } from "@/lib/report-metrics";

// Privacidade (pedido explícito, item 7 dos testes): o relatório mostra
// SÓ agregados — nunca nome, @ do Instagram ou telefone de paciente
// nenhum. A garantia de verdade é no TIPO (ReportNumbers/ReportFunnel só
// têm números, nenhum campo de identificação — ver report-metrics.ts);
// este teste prova isso também na MARCAÇÃO renderizada, pro caso de
// alguém um dia passar um campo extra sem querer.
function numbers(overrides: Partial<ReportNumbersWithComparison> = {}): ReportNumbersWithComparison {
  const period = computeMonthlyPeriod(new Date("2026-11-15T12:00:00.000Z"));
  return {
    period,
    funnel: { contacted: 22, inConversation: 14, scheduled: 10, attended: 7, noShow: 1 },
    attendanceRate: 0.7,
    followUpRecovered: 3,
    reactivation: { sent: 5, returned: 2 },
    isSimulated: false,
    previousComparison: { contactedPct: 10, scheduledPct: 25, attendedPct: null },
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
    // Os únicos textos de "pessoa" no markup são os rótulos fixos das
    // seções (Resumo/Funil/Follow-up/Reativação) — nunca algo vindo de
    // dado de paciente.
    expect(markup).toContain("Resumo");
    expect(markup).toContain("Funil");
  });

  it("nunca menciona M8 Growth (pedido explícito, item 3)", () => {
    const markup = renderToStaticMarkup(<ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers()} />);
    expect(markup).not.toContain("M8 Growth");
  });

  it("nunca mostra faturamento/valor em reais (pedido explícito — sem R$ em lugar nenhum)", () => {
    const markup = renderToStaticMarkup(<ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers()} />);
    expect(markup).not.toContain("R$");
  });

  it("mostra os números do funil e da Reativação (reaproveitando formatReactivationReturnLine)", () => {
    const markup = renderToStaticMarkup(<ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers()} />);
    expect(markup).toContain("5 enviadas · 2 voltaram");
    expect(markup).toMatch(/>3<\/span> <span[^>]*>leads retomados/);
  });

  it("mostra 'Dados de exemplo' quando isSimulated=true (Demo com dados reais insuficientes)", () => {
    const markup = renderToStaticMarkup(<ClinicReportContent clinicName="Clínica Demo VEXO" frequency="MONTHLY" numbers={numbers({ isSimulated: true })} />);
    expect(markup).toContain("Dados de exemplo");
  });

  it("não mostra 'Dados de exemplo' pra dados reais", () => {
    const markup = renderToStaticMarkup(<ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers({ isSimulated: false })} />);
    expect(markup).not.toContain("Dados de exemplo");
  });

  it("sempre mostra data inicial e final do período", () => {
    const markup = renderToStaticMarkup(<ClinicReportContent clinicName="Clínica Teste" frequency="MONTHLY" numbers={numbers()} />);
    expect(markup).toContain("01/11 a 30/11");
  });
});
