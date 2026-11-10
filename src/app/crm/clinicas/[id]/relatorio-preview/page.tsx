import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireInternalSession } from "@/lib/session";
import { getReportNumbersWithComparison } from "@/lib/report-metrics";
import { computeReportPeriod } from "@/lib/report-period";
import { ClinicReportContent } from "@/components/ClinicReportContent";
import { ClinicReportPeriodToggle } from "@/components/ClinicReportPeriodToggle";

export const dynamic = "force-dynamic";

// Preview ADMIN do Relatório (pedido explícito, item 3) — aberta pelo
// botão "Ver relatório" do painel da lista de Contas (ClinicReportPanel.tsx),
// numa aba NOVA DO NAVEGADOR (não uma aba do VEXO — esta rota não entra
// em clinic-nav.tsx, só é alcançável por aquele link direto). SOMENTE
// ADMIN (requireInternalSession), diferente da página pública
// /relatorio/[token]: aqui tem o seletor "15 dias (quinzenal)"/"30 dias
// (mensal)" pro admin conferir os dois, sempre com o período ATUAL
// (nunca um envio específico já congelado).
export default async function ClinicReportPreviewPage({ params }: { params: { id: string } }) {
  await requireInternalSession();

  const clinic = await prisma.clinic.findUnique({ where: { id: params.id }, select: { name: true } });
  if (!clinic) notFound();

  const now = new Date();
  const monthlyPeriod = computeReportPeriod("MONTHLY", now);
  const biweeklyPeriod = computeReportPeriod("BIWEEKLY", now);

  const [monthlyNumbers, biweeklyNumbers] = await Promise.all([
    getReportNumbersWithComparison(params.id, "MONTHLY", monthlyPeriod, now),
    getReportNumbersWithComparison(params.id, "BIWEEKLY", biweeklyPeriod, now),
  ]);

  return (
    <main className="min-h-screen bg-vexo-bg px-4 py-6 text-vexo-fg">
      <div className="mx-auto w-full max-w-md">
        <ClinicReportPeriodToggle
          monthly={<ClinicReportContent clinicName={clinic.name} frequency="MONTHLY" numbers={monthlyNumbers} />}
          biweekly={<ClinicReportContent clinicName={clinic.name} frequency="BIWEEKLY" numbers={biweeklyNumbers} />}
        />
      </div>
    </main>
  );
}
