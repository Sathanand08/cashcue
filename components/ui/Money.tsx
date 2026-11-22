import { formatINR } from "@/lib/money";

export function Money({
  paise,
  className = "",
}: {
  paise: number;
  className?: string;
}) {
  return <span className={`font-numeric tabular-nums ${className}`.trim()}>{formatINR(paise)}</span>;
}

export function Num({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={`font-numeric tabular-nums ${className}`.trim()}>{children}</span>;
}
