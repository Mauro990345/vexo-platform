import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getReportNumbersWithComparison } from "@/lib/report-metrics";
import { ClinicReportContent } from "@/components/ClinicReportContent";

export const dynamic = "force-dynamic";

// noindex (pedido explícito, item 4) — link de leitura pública, mas sem
// login e com token não-adivinhável: não deve aparecer em busca nenhuma.
export const metadata: Metadata = { robots: { index: false, follow: false } };

// Página pública do Relatório de resultados (quinzenal/mensal) — mesmo
// espírito de /briefing/[token]: SEM sessão/login do CRM, o token (de um
// ClinicReportDelivery, nunca o id real da clínica) é o único jeito de
// chegar aqui. Mostra SEMPRE o período CONGELADO da entrega (nunca o
// período "de hoje") — é o que já foi enviado por WhatsApp pra este link
// específico, nunca muda depois. token=null (revogado, ver
// revokeClinicReportLink) nunca bate com nenhuma linha (NULL não compara
// igual a nenhuma string em SQL) — mesmo efeito de "link inválido" que
// apagar a linha teria, sem perder o histórico de envio.
export default async function ClinicReportPublicPage({ params }: { params: { token: string } }) {
  const delivery = await prisma.clinicReportDelivery.findUnique({
    where: { token: params.token },
    select: {
      clinicId: true,
      periodType: true,
      periodStart: true,
      periodEnd: true,
      sentAt: true,
      clinic: { select: { name: true, active: true } },
    },
  });

  if (!delivery || !delivery.clinic.active) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-vexo-bg px-4 py-10 text-vexo-fg">
        <div className="w-full max-w-sm rounded-2xl border border-vexo-border bg-vexo-surface p-5 text-center">
          <h1 className="text-sm font-semibold">Link inválido ou expirado</h1>
          <p className="mt-2 text-xs text-vexo-muted">Peça um novo link de relatório.</p>
        </div>
      </main>
    );
  }

  // Referência pro cálculo "comparado a até agora" — o instante em que o
  // relatório foi de fato enviado (congelado); sem sentAt (ex.: link
  // copiado/aberto antes de um envio bem-sucedido), usa agora mesmo.
  const referenceNow = delivery.sentAt ?? new Date();
  const numbers = await getReportNumbersWithComparison(
    delivery.clinicId,
    delivery.periodType,
    { start: delivery.periodStart, end: delivery.periodEnd },
    referenceNow
  );

  return (
    <main className="min-h-screen bg-vexo-bg px-4 py-6 text-vexo-fg">
      <div className="mx-auto w-full max-w-md">
        <ClinicReportContent clinicName={delivery.clinic.name} frequency={delivery.periodType} numbers={numbers} />
      </div>
    </main>
  );
}
