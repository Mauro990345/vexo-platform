import { randomUUID } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";

// Uploads salvos em disco, FORA de public/ — servidos por uma Route
// Handler dedicada (src/app/uploads/[...path]/route.ts), não pelo estático
// embutido do Next. Testado e confirmado: o handler estático de public/ do
// Next não serve arquivo escrito depois do build (nem um simples .txt
// manual, sem passar pela lógica de upload em si) — só uma Route Handler,
// que lê do disco a cada request, garante que o arquivo apareça assim que
// é escrito, sem depender de rebuild nem do modo de output usado no deploy.
//
// IMPORTANTE: em containers efêmeros (Railway sem volume persistente
// montado), esse diretório é apagado a cada novo deploy — os arquivos não
// sobrevivem. Pra persistir de verdade em produção, é preciso anexar um
// Railway Volume nesse caminho (ou trocar isso por um bucket S3-compatível
// mais adiante); documentado também no README.
const UPLOAD_ROOT = path.join(process.cwd(), "uploads");
const MAX_BYTES = 25 * 1024 * 1024; // 25MB — cobre foto e vídeo curto de WhatsApp

export const ALLOWED_EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

export function resolveUploadPath(subdir: string, filename: string): string {
  return path.join(UPLOAD_ROOT, subdir, filename);
}

export async function saveUploadedAttachment(file: File, subdir: string): Promise<string> {
  if (file.size === 0) throw new Error("Arquivo vazio.");
  if (file.size > MAX_BYTES) throw new Error("Arquivo maior que 25MB — escolha um arquivo menor.");

  const extension = ALLOWED_EXTENSION_BY_MIME[file.type];
  if (!extension) {
    throw new Error("Formato não suportado — envie uma imagem (JPG/PNG/WEBP/GIF) ou vídeo (MP4/MOV/WEBM).");
  }

  const dir = path.join(UPLOAD_ROOT, subdir);
  await mkdir(dir, { recursive: true });

  const filename = `${randomUUID()}.${extension}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, filename), buffer);

  return `/uploads/${subdir}/${filename}`;
}

// Best-effort: usado ao trocar/remover um anexo pra não acumular arquivo
// órfão no disco. Silencioso em caso de falha (arquivo já removido, path
// antigo era uma URL externa de antes desta feature, etc.) — nunca deve
// derrubar a ação principal por causa de limpeza.
export async function deleteUploadedAttachment(url: string | null): Promise<void> {
  if (!url || !url.startsWith("/uploads/")) return;
  try {
    await unlink(path.join(UPLOAD_ROOT, url.slice("/uploads/".length)));
  } catch {
    // arquivo já não existe ou não é gerenciado por nós — ignora
  }
}
