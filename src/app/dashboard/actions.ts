"use server";

import { revalidatePath } from "next/cache";
import { requireClientSession } from "@/lib/session";
import { disconnectWhatsapp } from "@/lib/whatsapp-connection";

// A clínica só gerencia a própria conexão de WhatsApp — clinicId sempre vem
// da sessão, nunca de input do formulário, pra não dar brecha de desconectar
// o WhatsApp de outra clínica.
export async function disconnectWhatsappClientAction() {
  const session = await requireClientSession();
  const clinicId = session.user.clinicId as string;

  await disconnectWhatsapp(clinicId);

  revalidatePath("/dashboard/whatsapp");
  revalidatePath("/dashboard");
}
