import { revalidatePath } from "next/cache";

/**
 * Invalidate cached RSC payloads for screens that show cash / forecast data.
 * Call after any mutation that changes opening cash, cash_transactions,
 * invoices, bills, or recurring rules — otherwise soft navigation can show
 * stale Overview vs Forecast "Cash now" until a hard refresh.
 */
export function revalidateMoneyViews(): void {
  revalidatePath("/", "layout");
  revalidatePath("/");
  revalidatePath("/forecast");
  revalidatePath("/simulator");
  revalidatePath("/actions");
  revalidatePath("/receivables");
  revalidatePath("/bills");
  revalidatePath("/invoices");
  revalidatePath("/settings");
}
