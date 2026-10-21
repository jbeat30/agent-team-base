import test from 'node:test';
import assert from 'node:assert/strict';
import { cartTotal } from '../src/cart.js';

test('cartTotal sums price times quantity', () => {
  assert.equal(cartTotal([{ price: 2, qty: 3 }, { price: 1.5, qty: 2 }]), 9);
});
