// Finance report runner: the pricing function is chosen by name in config/reports.json
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../config/reports.json', import.meta.url), 'utf8'));

export async function priceTotal(items) {
  const pricing = await import('../src/pricing.js');
  const price = pricing[config.priceFn];
  return items.reduce((sum, item) => sum + price(item), 0);
}
