export function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-vexo-border bg-vexo-surface2 p-4">
      <p className="text-xs font-medium text-vexo-muted">{label}</p>
      <p className="mt-1.5 text-[1.75rem] font-semibold leading-none tracking-tight">{value}</p>
      {hint && <p className="mt-2 text-xs text-vexo-muted">{hint}</p>}
    </div>
  );
}
