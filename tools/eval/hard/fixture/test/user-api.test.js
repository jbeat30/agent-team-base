import test from 'node:test';
import assert from 'node:assert/strict';
import { makeUser } from '../src/users.js';
import { userResponse } from '../src/api/user-api.js';

test('userResponse exposes id, name, email', () => {
  const user = makeUser({ id: 1, name: 'Ann', email: 'ann@x.io' });
  assert.deepEqual(userResponse(user), { id: 1, name: 'Ann', email: 'ann@x.io' });
});
