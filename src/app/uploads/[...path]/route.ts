import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import { createReadStream } from "fs";
import { Readable } from "stream";
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
export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  const segments = params.path;
  if (segments.some((s) => s.includes("..") || s.includes("/") || s.includes("\\"))) {
    return new NextResponse("Not found", { status: 404 });
  }

  const extension = segments[segments.length - 1]?.split(".").pop()?.toLowerCase();
  const mime = extension ? MIME_BY_EXTENSION[extension] : undefined;
  if (!mime) return new NextResponse("Not found", { status: 404 });

  const filePath = path.join(UPLOAD_ROOT, ...segments);

  let fileSize: number;
  try {
    fileSize = (await stat(filePath)).size;
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  const baseHeaders: Record<string, string> = {
    "Content-Type": mime,
    "Cache-Control": "public, max-age=31536000, immutable",
    // Sem isso, vídeo não toca em navegadores mobile — Safari/WebKit no
    // iOS (inclusive o navegador embutido do Instagram) sempre pede o
    // vídeo por Range antes de reproduzir, e se recusa a tocar se o
    // servidor não responder 206 com Content-Range. Desktop tolera a
    // ausência disso (pede o arquivo inteiro de uma vez), o que mascarava
    // esse bug: "funciona no notebook, quebra no celular" é exatamente
    // essa assinatura.
    "Accept-Ranges": "bytes",
  };

  const range = req.headers.get("range");
  if (!range) {
    try {
      const data = await readFile(filePath);
      return new NextResponse(new Uint8Array(data), {
        headers: { ...baseHeaders, "Content-Length": String(fileSize) },
      });
    } catch {
      return new NextResponse("Not found", { status: 404 });
    }
  }

  // "bytes=start-end" — end é opcional (significa "até o fim do arquivo").
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) {
    return new NextResponse("Range inválido", { status: 416, headers: { "Content-Range": `bytes */${fileSize}` } });
  }

  const start = match[1] ? parseInt(match[1], 10) : 0;
  const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
  if (start > end || end >= fileSize) {
    return new NextResponse("Range inválido", { status: 416, headers: { "Content-Range": `bytes */${fileSize}` } });
  }

  const stream = createReadStream(filePath, { start, end });
  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    status: 206,
    headers: {
      ...baseHeaders,
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Content-Length": String(end - start + 1),
    },
  });
}
