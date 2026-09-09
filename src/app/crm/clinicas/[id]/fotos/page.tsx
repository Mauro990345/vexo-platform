import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireInternalSession } from "@/lib/session";
import { addResultPhoto, deleteResultPhoto } from "../../actions";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";

export const dynamic = "force-dynamic";

// Biblioteca de fotos de resultado (antes/depois) por clínica, cada uma
// marcada com uma categoria/tag livre (ex: "botox", "preenchimento
// labial") — usada pela IA durante a conversa via send_result_photo (ver
// src/lib/anthropic.ts) quando o lead demonstra interesse específico
// naquele procedimento. Mesma infraestrutura de upload/Volume do vídeo de
// confirmação (agente-ia), só que N arquivos em vez de 1.
export default async function ClinicResultPhotosPage({ params }: { params: { id: string } }) {
  await requireInternalSession();

  const [clinic, photos] = await Promise.all([
    prisma.clinic.findUnique({ where: { id: params.id } }),
    prisma.resultPhoto.findMany({ where: { clinicId: params.id }, orderBy: { createdAt: "desc" } }),
  ]);
  if (!clinic) notFound();

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-base font-semibold tracking-tight">Fotos de resultado</h1>
        <p className="mt-1 text-xs text-vexo-muted">
          Fotos de antes/depois por procedimento. A IA busca uma foto da categoria mencionada pelo
          lead e anexa na resposta quando fizer sentido — no máximo uma por conversa.
        </p>
      </div>

      <form
        action={addResultPhoto.bind(null, clinic.id)}
        className="flex flex-wrap items-end gap-2.5 rounded-xl border border-vexo-border bg-vexo-surface p-3.5"
      >
        <div className="min-w-0 flex-1">
          <label className="mb-1 block text-xs text-vexo-muted" htmlFor="category">
            Categoria/procedimento
          </label>
          <input
            id="category"
            name="category"
            required
            placeholder="ex: botox, preenchimento labial, harmonização facial"
            className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-vexo-muted" htmlFor="photoFile">
            Foto
          </label>
          <input
            id="photoFile"
            name="photoFile"
            type="file"
            accept="image/*"
            required
            className="block text-xs text-vexo-muted file:mr-2 file:rounded-lg file:border file:border-vexo-border file:bg-vexo-bg file:px-2.5 file:py-1.5 file:text-xs file:text-vexo-fg hover:file:border-vexo-accent"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg border border-vexo-accent px-2.5 py-1.5 text-xs font-medium text-vexo-accent hover:bg-vexo-accent/10"
        >
          Adicionar foto
        </button>
      </form>

      {photos.length === 0 ? (
        <p className="text-xs text-vexo-muted">Nenhuma foto cadastrada ainda.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {photos.map((photo) => (
            <div key={photo.id} className="overflow-hidden rounded-xl border border-vexo-border bg-vexo-surface">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.imageUrl} alt={photo.category} className="h-32 w-full object-cover" />
              <div className="flex items-center justify-between gap-2 p-2">
                <span className="min-w-0 truncate text-xs font-medium">{photo.category}</span>
                <form action={deleteResultPhoto.bind(null, clinic.id, photo.id)}>
                  <ConfirmSubmitButton
                    confirmMessage="Remover esta foto? Essa ação não pode ser desfeita."
                    className="shrink-0 text-caption text-vexo-muted hover:text-red-500"
                  >
                    Remover
                  </ConfirmSubmitButton>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
