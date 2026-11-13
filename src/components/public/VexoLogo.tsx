// Logo do VEXO IA (página pública e páginas legais): "X" simétrico de dois
// traços retos cruzados + "vexo" (minúsculas, 500, 21px) e " ia" (cinza,
// 400). Nunca em caixa alta — `normal-case` explícito pra nenhum estilo
// herdado transformar o texto. Ver DESIGN.md, "Página pública".
export function VexoMark({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" fill="none" aria-hidden="true" className={`shrink-0 ${className}`}>
      <path d="M6 6l14 14" strokeWidth={2.4} strokeLinecap="round" className="stroke-vexo-pubAccent" />
      <path d="M20 6L6 20" strokeWidth={2.4} strokeLinecap="round" className="stroke-vexo-pubFg" strokeOpacity={0.8} />
    </svg>
  );
}

export function VexoLogo({ className = "", markSize = 20 }: { className?: string; markSize?: number }) {
  return (
    <span className={`inline-flex items-center gap-1.5 normal-case ${className}`}>
      <VexoMark size={markSize} />
      <span className="text-[21px] font-medium normal-case leading-none tracking-[-0.02em] text-vexo-pubFg">
        vexo<span className="font-normal text-vexo-pubMuted"> ia</span>
      </span>
    </span>
  );
}
