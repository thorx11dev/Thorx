/**
 * Shared "points-style" display formatter.
 *
 * THORX never surfaces a raw PKR amount outside the payout / Conversion Room
 * flow (audit findings 1-A/1-B). Anywhere a cash-like decimal value (referral
 * earnings, totals, etc.) needs a headline figure elsewhere in the app, it is
 * shown as its TX-Points equivalent instead of literal currency.
 *
 * Centralized here (rather than redefined per-component) so the User Portal
 * and the dashboard cards can never drift out of sync on how the same
 * underlying value is displayed.
 */
export function formatPoints(amount: string | number): string {
  const numAmount = typeof amount === "string" ? parseFloat(amount) : amount;
  const safeAmount = Number.isFinite(numAmount) ? numAmount : 0;
  const points = Math.round(safeAmount * 100);
  return `${points.toLocaleString()} TX-Points`;
}
