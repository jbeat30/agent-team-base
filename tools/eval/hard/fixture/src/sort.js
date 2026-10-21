import { getPrice } from './pricing.js';

// Comparator used by the storefront listing
export const byPrice = (a, b) => getPrice(a) - getPrice(b);
