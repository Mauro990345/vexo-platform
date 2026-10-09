import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveClinicWhatsappLink } from "@/lib/conversation-pipeline";

export const dynamic = "force-dynamic";

// Rota pública (sem sessão) usada só como FALLBACK do cartão de contato da
// clínica (ver Message.clinicContactCard/dispatchOneMessage, dispatch.ts):
// quando a Graph API rejeita o Generic Template, o lead recebe este link
// em texto normal em vez do cartão — ele redireciona (302) pro WhatsApp da
// clínica sem o número aparecer em lugar nenhum visível ao lead.
//
// Nunca devolve nenhum outro dado da clínica (nome, endereço, etc.) — nem
// no corpo, nem em erro: a resposta é SEMPRE só um redirect (302), em
// qualquer cenário (clínica existe/não existe, número válido/invalido).
// Mesma convenção de montar a URL de destino a partir de
// process.env.APP_URL (nunca de req.url) usada em
// src/app/acesso/[token]/route.ts — ver o comentário grande lá pro bug
// real que isso evita atrás do proxy do Railway.
const appUrl = process.env.APP_URL ?? "";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const clinic = await prisma.clinic.findUnique({
    where: { id: params.id },
    select: { clientWhatsappNumber: true },
  });

  const whatsappE164 = resolveClinicWhatsappLink(clinic?.clientWhatsappNumber);
  if (!whatsappE164) {
    return NextResponse.redirect(`${appUrl}/login`, 302);
  }

  // 302 (não o 307 padrão do Next) — pedido explícito; também evita que o
  // navegador reenvie um método não-GET nesse redirect (nunca deveria
  // acontecer aqui, já que é sempre um link clicado, mas 302 é o código
  // semanticamente certo pra um redirect temporário como este).
  return NextResponse.redirect(`https://wa.me/${whatsappE164}`, 302);
}
