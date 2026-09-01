import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";

// Upload de anexos (imagem/vídeo) para armazenamento compatível com S3 —
// funciona com Cloudflare R2, AWS S3, Backblaze B2, DigitalOcean Spaces etc,
// bastando apontar as variáveis de ambiente para o provedor escolhido.
// O bucket precisa ter leitura pública (ver README) pois a URL resultante é
// entregue direto para a Graph API do Instagram buscar o arquivo.

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB — dentro do limite de anexos de mídia do Instagram

function s3Client(): S3Client {
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "Armazenamento de arquivos não configurado (S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY)."
    );
  }

  return new S3Client({
    endpoint: process.env.S3_ENDPOINT || undefined,
    region: process.env.S3_REGION || "auto",
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: Boolean(process.env.S3_ENDPOINT),
  });
}

export async function uploadAttachment(file: File, folder: string): Promise<string> {
  const bucket = process.env.S3_BUCKET;
  const publicBaseUrl = process.env.S3_PUBLIC_BASE_URL;
  if (!bucket || !publicBaseUrl) {
    throw new Error("Armazenamento de arquivos não configurado (S3_BUCKET / S3_PUBLIC_BASE_URL).");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`Arquivo muito grande (máx. ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB).`);
  }

  const client = s3Client();
  const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
  const key = `${folder}/${crypto.randomUUID()}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: file.type || "application/octet-stream",
    })
  );

  return `${publicBaseUrl.replace(/\/$/, "")}/${key}`;
}

export async function deleteAttachment(url: string): Promise<void> {
  const bucket = process.env.S3_BUCKET;
  const publicBaseUrl = process.env.S3_PUBLIC_BASE_URL;
  if (!bucket || !publicBaseUrl || !url.startsWith(publicBaseUrl)) return;

  const key = url.slice(publicBaseUrl.replace(/\/$/, "").length + 1);
  if (!key) return;

  const client = s3Client();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
