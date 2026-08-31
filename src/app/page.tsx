import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isInternal } from "@/lib/session";

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  if (!session) redirect("/login");
  if (isInternal(session.user.role)) redirect("/crm");
  redirect("/dashboard");
}
