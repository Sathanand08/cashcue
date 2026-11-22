import Link from "next/link";

export function HorizonPills({
  basePath,
  active,
  horizons = [30, 60, 90],
  ariaLabel,
}: {
  basePath: string;
  active: number;
  horizons?: readonly number[];
  ariaLabel: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={ariaLabel}>
      {horizons.map((h) => {
        const isActive = h === active;
        return (
          <Link
            key={h}
            href={`${basePath}?days=${h}`}
            className={
              isActive
                ? "rounded-md bg-cc-primary px-3 py-1.5 text-sm font-medium font-numeric tabular-nums text-white"
                : "rounded-md border border-cc-border bg-cc-card px-3 py-1.5 text-sm font-numeric tabular-nums text-cc-ink hover:bg-cc-bg"
            }
          >
            {h} days
          </Link>
        );
      })}
    </div>
  );
}
