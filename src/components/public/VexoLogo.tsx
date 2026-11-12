// Logo do VEXO IA (página pública e páginas legais): "X" fino de dois traços
// curvos cruzados + "vexo" (minúsculas, 500) e " ia" (cinza, 400). Nunca em
// caixa alta. Ver DESIGN.md, "Página pública".
export function VexoMark({ size = 26, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" fill="none" aria-hidden="true" className={className}>
      <path d="M5 5c6 4 10 11 16 16" strokeWidth={2.4} strokeLinecap="round" className="stroke-vexo-pubAccent" />
      <path d="M21 5c-6 4-10 11-16 16" strokeWidth={2.4} strokeLinecap="round" className="stroke-vexo-pubFg" strokeOpacity={0.75} />
    </svg>
  );
}

export function VexoLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <VexoMark />
      <span className="text-2xl font-medium leading-none tracking-[-0.02em] text-vexo-pubFg">
        vexo<span className="font-normal text-vexo-pubMuted"> ia</span>
      </span>
    </span>
  );
}
