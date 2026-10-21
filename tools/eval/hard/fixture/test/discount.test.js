import test from 'node:test';
import assert from 'node:assert/strict';
import { percentOff } from '../src/discount.js';

test('percentOff applies a percentage discount', () => {
  assert.equal(percentOff(200, 10), 180);
});
