export function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-vexo-border bg-vexo-surface p-4">
      <p className="text-xs text-vexo-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-vexo-muted">{hint}</p>}
    </div>
  );
}
