import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireInternalSession } from "@/lib/session";
import { FollowUpView } from "@/app/crm/(global)/follow-up/FollowUpView";

export const dynamic = "force-dynamic";

// Mesma configuração de follow-up do CRM global (FollowUpStep/
// FollowUpSettings não têm clinicId, é compartilhada por todas as
// clínicas) — só que renderizada aqui pra manter a sidebar no contexto
// da clínica em vez de trocar pra sidebar global ao navegar.
export default async function ClinicFollowUpPage({ params }: { params: { id: string } }) {
  await requireInternalSession();

  const clinic = await prisma.clinic.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!clinic) notFound();

  return <FollowUpView />;
}
