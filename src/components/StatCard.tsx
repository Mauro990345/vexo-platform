export function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-vexo-border bg-vexo-surface2 p-2.5">
      <p className="truncate text-[11px] font-medium text-vexo-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold leading-none tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-vexo-muted">{hint}</p>}
    </div>
  );
}
