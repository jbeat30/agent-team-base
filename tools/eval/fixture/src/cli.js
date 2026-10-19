import { addTask, completeTask } from './tasks.js';

export function run(args) {
  if (args[0] === 'add') return addTask(args[1]);
  if (args[0] === 'done') return completeTask(Number(args[1])) ? 'ok' : 'not found';
  return 'usage: add <title> | done <id>';
}
