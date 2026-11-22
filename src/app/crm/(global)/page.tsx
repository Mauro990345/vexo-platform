import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ClinicSearchList } from "@/components/ClinicSearchList";
import { ReviewerLoginSection } from "@/components/ReviewerLoginSection";
import { getClinicReportRowSummaries } from "@/app/crm/clinicas/report-actions";
import { getReviewerLoginStatus } from "./reviewer-actions";

export const dynamic = "force-dynamic";

// "Contas" agora é só o seletor/busca de clínica — as métricas que
// antes ficavam misturadas aqui moraram pra "Painel" (ver
// crm/(global)/painel/page.tsx).
export default async function ClinicsOverviewPage({
  searchParams,
}: {
  searchParams: { oauthError?: string };
}) {
  const session = await getServerSession(authOptions);
  const isAdmin = session?.user.role === "INTERNAL_ADMIN";

  const clinics = await prisma.clinic.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, active: true },
  });

  // Texto discreto "Relatório · 30/11" (pedido explícito, item 1) — uma
  // query em lote só, nunca N chamadas por linha (ver
  // getClinicReportRowSummaries, report-actions.ts).
  const reportSummaries = await getClinicReportRowSummaries(clinics.map((c) => c.id));
  const clinicsWithReport = clinics.map((c) => ({ ...c, reportNextSendDateLabel: reportSummaries[c.id]?.nextSendDateLabel ?? null }));

  // Só Admin gerencia o login Revisor (ver UserRole.REVIEWER) — Equipe nem
  // consulta o status dele (requireAdminSession, dentro de
  // getReviewerLoginStatus, já barraria mesmo assim).
  const reviewerStatus = isAdmin ? await getReviewerLoginStatus() : null;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-page-title tracking-tight">Contas</h1>
        <Link
          href="/crm/clinicas/nova"
          className="rounded-lg bg-vexo-accent px-3 py-1.5 text-sm font-medium text-vexo-accentFg hover:opacity-90"
        >
          Criar conta
        </Link>
      </div>

      {/* Só aparece no caso raro do callback OAuth não conseguir recuperar
          de qual clínica veio o fluxo (state ausente/inválido) — ver
          errorRedirect em instagram/callback/route.ts. Sem clinicId não dá
          pra mandar direto pra Conexões da clínica certa, então cai aqui;
          "tentar de novo" nesse caso é reabrir Conexões da clínica manualmente. */}
      {searchParams.oauthError && (
        <p className="mb-4 rounded-lg border border-vexo-error/30 bg-vexo-error/10 p-2 text-xs text-vexo-error">
          Não foi possível conectar: {searchParams.oauthError.replace(/\.+$/, "")}. Abra a clínica desejada e tente
          novamente em Conexões.
        </p>
      )}

      <ClinicSearchList clinics={clinicsWithReport} />

      {reviewerStatus && <ReviewerLoginSection initialStatus={reviewerStatus} />}
    </div>
  );
}
