import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isFollowerToolEnabled } from "@/lib/follower-tool";
import { SeguidoresView } from "./SeguidoresView";
import { getFollowerToolClinicsAction } from "../actions";

export const dynamic = "force-dynamic";

// Atrás do interruptor FOLLOWER_TOOL_ENABLED (ver follower-tool.ts/
// README.md) — desligado (padrão), 404 pra todo mundo, inclusive admin,
// sem nenhuma pista de que esta rota existe. Ligado, só INTERNAL_ADMIN
// (não STAFF); qualquer outro papel logado como interno, 404 também.
// CLIENT/sem sessão nem chegam até aqui: `crm/layout.tsx` (pai, toda a
// árvore /crm/*) já exige sessão interna antes disso — pra esses casos o
// efeito já é o mesmo de qualquer outra tela do CRM (redirect, nunca
// revelando nada específico desta rota), então o 404 abaixo cobre
// exatamente o que a camada de cima não cobre: admin com o interruptor
// desligado, e staff interno com o interruptor ligado.
export default async function SeguidoresPage() {
  if (!isFollowerToolEnabled()) notFound();

  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "INTERNAL_ADMIN") notFound();

  const clinics = await getFollowerToolClinicsAction();
  return <SeguidoresView clinics={clinics} />;
}
