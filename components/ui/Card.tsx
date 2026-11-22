export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border border-cc-border bg-cc-card ${className}`.trim()}>{children}</div>
  );
}
