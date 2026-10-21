import * as pricing from '../src/pricing.js';

export function csvRow(item) {
  return [item.name, pricing.getPrice(item), item.qty].join(',');
}
