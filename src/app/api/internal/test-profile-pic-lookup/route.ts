import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isInternal } from "@/lib/session";
import { decryptToken } from "@/lib/crypto";
import { isRealIgScopedId } from "@/lib/instagram";
import { prisma } from "@/lib/prisma";

// TESTE ÚNICO — pra confirmar ou fechar de vez uma pista nova sobre foto de
// perfil: até agora só testamos o campo profile_picture_url dentro da
// Conversations API (/{ig-user-id}/conversations, com e sem sintaxe de
// expansão) e o Business Discovery API (exige lead Business/Creator). Nunca
// testamos "profile_pic" (nome de campo diferente) direto no node do
// usuário por IGSID (GET /{igScopedId}?fields=...) — o MESMO endpoint que
// getInstagramUserProfile já usa em produção pra pegar "name" (ver
// instagram.ts), só que essa função só pede "name" hoje, nunca username
// nem foto. Essa rota reaproveita o token/produto principal (Instagram
// Login) sem tocar em getInstagramUserProfile nem no pipeline automático —
// só confirma se profile_pic vem preenchido nesse node específico.
//
// Rota interna, sem link nenhum na UI — visitar manualmente logado como
// staff/admin. Remover depois de usar (diagnóstico, não uma feature).
// Uso: GET /api/internal/test-profile-pic-lookup
//      GET /api/internal/test-profile-pic-lookup?leadId=xxxx
// Sem leadId, procura automaticamente um lead real (igScopedId numérico)
// chamado "Mauro" ou "Leonardo" com Instagram conectado na clínica.
const GRAPH_API_VERSION = "v24.0";
const IG_GRAPH_BASE = `https://graph.instagram.com/${GRAPH_API_VERSION}`;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isInternal(session.user.role)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const leadId = req.nextUrl.searchParams.get("leadId");

  const lead = leadId
    ? await prisma.lead.findUnique({
        where: { id: leadId },
        include: { clinic: { include: { instagramAccount: true } } },
      })
    : await prisma.lead.findFirst({
        where: {
          OR: [{ name: { contains: "mauro", mode: "insensitive" } }, { name: { contains: "leonardo", mode: "insensitive" } }],
          clinic: { instagramAccount: { isNot: null } },
        },
        include: { clinic: { include: { instagramAccount: true } } },
        orderBy: { updatedAt: "desc" },
      });

  if (!lead) {
    return NextResponse.json(
      { error: "Nenhum lead real (Mauro/Leonardo) encontrado com Instagram conectado. Passe ?leadId= explicitamente." },
      { status: 404 }
    );
  }
  if (!lead.clinic.instagramAccount) {
    return NextResponse.json({ error: `Lead "${lead.name}" está numa clínica sem Instagram conectado.` }, { status: 400 });
  }
  if (!isRealIgScopedId(lead.igScopedId)) {
    return NextResponse.json(
      { error: `igScopedId "${lead.igScopedId}" não é um IGSID real (provavelmente lead de demo/seed).` },
      { status: 400 }
    );
  }

  const accessToken = decryptToken(lead.clinic.instagramAccount.accessTokenEnc);

  const url = new URL(`${IG_GRAPH_BASE}/${lead.igScopedId}`);
  url.searchParams.set("fields", "name,username,profile_pic");
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString());
  const rawText = await res.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    // Resposta não-JSON — devolve o texto cru mesmo assim abaixo.
  }

  return NextResponse.json({
    lead: { id: lead.id, name: lead.name, igUsername: lead.igUsername, igScopedId: lead.igScopedId },
    clinic: lead.clinic.name,
    requestedFields: "name,username,profile_pic",
    metaHttpStatus: res.status,
    metaResponseParsed: parsed,
    metaResponseRaw: rawText,
  });
}
