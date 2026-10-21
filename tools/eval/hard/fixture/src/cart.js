import { getPrice } from './pricing.js';

export function cartTotal(cart) {
  return cart.reduce((sum, item) => sum + getPrice(item) * item.qty, 0);
}
