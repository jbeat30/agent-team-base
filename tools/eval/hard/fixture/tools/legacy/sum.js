import { getPrice as price } from '../../src/pricing.js';

export function sumPrices(items) {
  return items.map(price).reduce((a, b) => a + b, 0);
}
