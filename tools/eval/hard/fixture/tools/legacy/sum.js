import { getPrice as price } from '../../src/pricing.js';

export function sumPrices(items) {
  let total = 0;
  for (const item of items) total += price(item);
  return total;
}
