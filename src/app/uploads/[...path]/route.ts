import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { ALLOWED_EXTENSION_BY_MIME } from "@/lib/uploads";

export const dynamic = "force-dynamic";

const MIME_BY_EXTENSION = Object.fromEntries(
  Object.entries(ALLOWED_EXTENSION_BY_MIME).map(([mime, ext]) => [ext, mime])
);

const UPLOAD_ROOT = path.join(process.cwd(), "uploads");

// Serve os arquivos de src/lib/uploads.ts. Precisa ser público (sem sessão)
// — os anexos de follow-up são buscados pelo WhatsApp/Meta ao entregar a
// mensagem pro lead, não só por quem está logado no CRM.
export async function GET(_req: NextRequest, { params }: { params: { path: string[] } }) {
  const segments = params.path;
  if (segments.some((s) => s.includes("..") || s.includes("/") || s.includes("\\"))) {
    return new NextResponse("Not found", { status: 404 });
  }

  const extension = segments[segments.length - 1]?.split(".").pop()?.toLowerCase();
  const mime = extension ? MIME_BY_EXTENSION[extension] : undefined;
  if (!mime) return new NextResponse("Not found", { status: 404 });

  try {
    const filePath = path.join(UPLOAD_ROOT, ...segments);
    const data = await readFile(filePath);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": mime,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
