import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isInternal } from "@/lib/session";
import { buildGoogleOAuthUrl } from "@/lib/google-calendar";
import { signOAuthState } from "@/lib/oauth-state";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isInternal(session.user.role)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const clinicId = req.nextUrl.searchParams.get("clinicId");
  if (!clinicId) return new NextResponse("clinicId obrigatório", { status: 400 });

  const state = signOAuthState(clinicId);
  return NextResponse.redirect(buildGoogleOAuthUrl(state));
}
