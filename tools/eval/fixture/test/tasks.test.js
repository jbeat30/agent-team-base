import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addTask, completeTask, listTasks, resetTasks } from '../src/tasks.js';

test('addTask는 항목을 저장', () => {
  resetTasks();
  addTask('a');
  assert.equal(listTasks().length, 1);
});

test('completeTask는 성공 시 true, 없으면 false', () => {
  resetTasks();
  const t = addTask('a');
  assert.equal(completeTask(t.id), true);
  assert.equal(completeTask(999), false);
});
