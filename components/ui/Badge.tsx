const VARIANTS = {
  ok: "bg-cc-ok-bg text-cc-ok-fg",
  warn: "bg-cc-amber-bg text-cc-amber-fg",
  danger: "bg-cc-danger-bg text-cc-danger-fg",
  neutral: "bg-cc-bg text-cc-muted border border-cc-border",
} as const;

export function Badge({
  variant = "neutral",
  children,
  className = "",
}: {
  variant?: keyof typeof VARIANTS;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium font-numeric tabular-nums ${VARIANTS[variant]} ${className}`.trim()}
    >
      {children}
    </span>
  );
}
