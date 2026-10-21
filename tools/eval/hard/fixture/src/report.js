import { getPrice } from './pricing.js';

export function reportLine(item) {
  return `${item.name}: ${getPrice(item).toFixed(2)} x ${item.qty}`;
}
