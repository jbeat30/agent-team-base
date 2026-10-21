import test from 'node:test';
import assert from 'node:assert/strict';
import { reportLine } from '../src/report.js';

test('reportLine formats name, price, and quantity', () => {
  assert.equal(reportLine({ name: 'Pen', price: 1.5, qty: 2 }), 'Pen: 1.50 x 2');
});
