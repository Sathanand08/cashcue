"use client";

import { useEffect, useState } from "react";

/**
 * Renders children only after mount so Recharts ResponsiveContainer
 * can measure a real DOM box (avoids blank SSR charts).
 */
export function ChartFrame({
  children,
  className = "",
  heightClass = "h-64 sm:h-72",
}: {
  children: React.ReactNode;
  className?: string;
  heightClass?: string;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  return (
    <div className={`w-full min-w-0 ${heightClass} ${className}`.trim()}>
      {ready ? (
        children
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded-md bg-cc-bg text-sm text-cc-muted">
          Loading chart…
        </div>
      )}
    </div>
  );
}
