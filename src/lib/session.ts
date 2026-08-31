import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

// Helpers de sessão usados pelas páginas server-side do App Router.
// Garantem isolamento de tenant: um usuário CLIENT só enxerga dados de
// clinicId === session.user.clinicId. Usuários internos veem tudo.

export async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  return session;
}

export async function requireInternalSession() {
  const session = await requireSession();
  if (session.user.role !== "INTERNAL_ADMIN" && session.user.role !== "INTERNAL_STAFF") {
    redirect("/dashboard");
  }
  return session;
}

export async function requireClientSession() {
  const session = await requireSession();
  if (session.user.role !== "CLIENT" || !session.user.clinicId) {
    redirect("/crm");
  }
  return session;
}

export function isInternal(role: string) {
  return role === "INTERNAL_ADMIN" || role === "INTERNAL_STAFF";
}
