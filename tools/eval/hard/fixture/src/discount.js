// Discount helpers
export function percentOff(total, pct) {
  return Math.round(total * (100 - pct)) / 100;
}
