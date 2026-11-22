export function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "ok" | "warn" | "danger" | "default";
}) {
  const valueTone =
    tone === "ok"
      ? "text-cc-ok-fg"
      : tone === "warn"
        ? "text-cc-amber-fg"
        : tone === "danger"
          ? "text-cc-danger-fg"
          : "text-cc-ink";

  return (
    <div className="border-t border-cc-border pt-3">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-cc-muted">{label}</p>
      <p className={`mt-1 font-numeric text-2xl tabular-nums sm:text-3xl ${valueTone}`}>{value}</p>
      {hint ? <p className="mt-1 text-sm text-cc-muted">{hint}</p> : null}
    </div>
  );
}
