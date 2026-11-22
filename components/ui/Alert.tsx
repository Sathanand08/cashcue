export function Alert({
  tone = "danger",
  children,
}: {
  tone?: "danger" | "ok" | "warn";
  children: React.ReactNode;
}) {
  const styles =
    tone === "ok"
      ? "border-cc-ok-fg/20 bg-cc-ok-bg text-cc-ok-fg"
      : tone === "warn"
        ? "border-cc-amber-fg/20 bg-cc-amber-bg text-cc-amber-fg"
        : "border-cc-danger-fg/20 bg-cc-danger-bg text-cc-danger-fg";

  return (
    <p className={`rounded-md border px-3 py-2 text-sm ${styles}`} role={tone === "danger" ? "alert" : undefined}>
      {children}
    </p>
  );
}
