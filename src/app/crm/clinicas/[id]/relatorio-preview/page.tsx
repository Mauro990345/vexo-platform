import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireInternalSession } from "@/lib/session";
import { getReportNumbersWithComparison } from "@/lib/report-metrics";
import { computeLastClosedPeriod } from "@/lib/report-period";
import { ClinicReportContent } from "@/components/ClinicReportContent";
import { ClinicReportPeriodToggle } from "@/components/ClinicReportPeriodToggle";

export const dynamic = "force-dynamic";

// Preview ADMIN do Relatório (pedido explícito, item 3) — aberta pelo
// botão "Ver relatório" do painel da lista de Contas (ClinicReportPanel.tsx),
// numa aba NOVA DO NAVEGADOR (não uma aba do VEXO — esta rota não entra
// em clinic-nav.tsx, só é alcançável por aquele link direto). SOMENTE
// ADMIN (requireInternalSession), diferente da página pública
// /relatorio/[token]: aqui tem o seletor "15 dias (quinzenal)"/"30 dias
// (mensal)" pro admin conferir os dois.
//
// Período: SEMPRE o último período FECHADO de cada tipo (ver
// computeLastClosedPeriod, report-period.ts), nunca o que está em
// andamento (ajuste explícito, 2ª rodada) — comparar um mês/quinzena
// parcial contra um anterior completo produzia uma queda artificial
// (ex.: "-100%") só por o período atual ainda não ter acabado, sem
// nenhuma relação com o desempenho real. Os relatórios de verdade
// ENVIADOS (worker/"Enviar agora") continuam cobrindo o período que
// contém o momento do envio, sempre já no dia de fechamento — ver
// clinic-reports.ts, não mexido nesta rodada.
export default async function ClinicReportPreviewPage({ params }: { params: { id: string } }) {
  await requireInternalSession();

  const clinic = await prisma.clinic.findUnique({ where: { id: params.id }, select: { name: true } });
  if (!clinic) notFound();

  const now = new Date();
  const monthlyPeriod = computeLastClosedPeriod("MONTHLY", now);
  const biweeklyPeriod = computeLastClosedPeriod("BIWEEKLY", now);

  const [monthlyNumbers, biweeklyNumbers] = await Promise.all([
    getReportNumbersWithComparison(params.id, "MONTHLY", monthlyPeriod, now),
    getReportNumbersWithComparison(params.id, "BIWEEKLY", biweeklyPeriod, now),
  ]);

  return (
    <main className="min-h-screen bg-vexo-bg px-4 py-6 text-vexo-fg">
      <div className="mx-auto w-full max-w-md sm:max-w-xl">
        <ClinicReportPeriodToggle
          monthly={<ClinicReportContent clinicName={clinic.name} frequency="MONTHLY" numbers={monthlyNumbers} />}
          biweekly={<ClinicReportContent clinicName={clinic.name} frequency="BIWEEKLY" numbers={biweeklyNumbers} />}
        />
      </div>
    </main>
  );
}
