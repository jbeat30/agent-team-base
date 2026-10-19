const tasks = [];
let nextId = 1;

// 할일 추가, 생성된 항몽 반환
export function addTask(title) {
  const task = { id: nextId++, title, done: false };
  tasks.push(task);
  return task;
}

export function completeTask(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return false;
  task.done = true;
  return true;
}

export function listTasks() {
  return [...tasks];
}

export function resetTasks() {
  tasks.length = 0;
  nextId = 1;
}
