// team-check 실행기 단위 검사, 임시 프로젝트에서 실행
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = join(dirname(fileURLToPath(import.meta.url)), '..', 'template', '.claude-team', 'bin', 'team-check.mjs');
const RUN_ID = '20260101-0000-test';

function plan(rows) {
  const table = rows.map(([c, cwd, effect]) => `| \`${c}\` | ${cwd} | ${effect} |`).join('\n');
  return `# 기획안\n\n## 7. 완료 기준\n\n| a |\n\n## 8. 검사 명령과 부작용 분류\n\n| 명령 | 작업 경로 | 부작용(자동 수정·외부 접근·상태 변경) |\n| --- | --- | --- |\n${table}\n\n## 9. 완료 체크리스트\n`;
}

function project(rows) {
  const dir = mkdtempSync(join(tmpdir(), 'team-check-'));
  const git = (...args) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: dir });
  git('init', '-q');
  writeFileSync(join(dir, 'a.txt'), 'base\n');
  git('add', '-A');
  git('commit', '-qm', 'base');
  mkdirSync(join(dir, '.claude-team', 'runs', RUN_ID), { recursive: true });
  writeFileSync(join(dir, '.claude-team', 'runs', RUN_ID, 'plan.md'), plan(rows));
  return dir;
}

const run = (dir, ...args) => spawnSync(process.execPath, [script, ...args], { cwd: dir, encoding: 'utf8' });
const checksDir = (dir) => join(dir, '.claude-team', 'runs', RUN_ID, 'checks');

test('승인된 명령을 실행하고 exit code와 원본 출력을 기록', () => {
  const cmd = `node -e "console.log('hello');process.exit(3)"`;
  const dir = project([[cmd, '.', '없음']]);
  const result = run(dir, 'run', RUN_ID, cmd);
  assert.equal(result.status, 0, result.stderr);
  const record = JSON.parse(readFileSync(join(checksDir(dir), '01', 'record.json'), 'utf8'));
  assert.equal(record.exitCode, 3);
  assert.equal(record.command, cmd);
  assert.match(readFileSync(join(checksDir(dir), '01', 'stdout.txt'), 'utf8'), /hello/);
  assert.equal(run(dir, 'verify', RUN_ID).status, 0);
});

test('기획안에 없는 명령은 실행하지 않음', () => {
  const dir = project([['node -e "0"', '.', '없음']]);
  const result = run(dir, 'run', RUN_ID, 'node -e "1"');
  assert.equal(result.status, 2);
  assert.equal(existsSync(checksDir(dir)), false);
});

test('부작용 분류가 없음이 아니면 승인 플래그 없이 거부', () => {
  const cmd = 'node -e "0"';
  const dir = project([[cmd, '.', '있음(상태 변경)']]);
  assert.equal(run(dir, 'run', RUN_ID, cmd).status, 2);
  assert.equal(run(dir, 'run', RUN_ID, cmd, '--allow-side-effects').status, 0);
  const record = JSON.parse(readFileSync(join(checksDir(dir), '01', 'record.json'), 'utf8'));
  assert.equal(record.sideEffectsApproved, true);
});

test('프로젝트 밖 작업 경로는 거부', () => {
  const cmd = 'node -e "0"';
  const dir = project([[cmd, '../outside', '없음']]);
  assert.equal(run(dir, 'run', RUN_ID, cmd).status, 2);
});

test('출력 변조와 기획안 변경을 verify가 탐지', () => {
  const cmd = 'node -e "console.log(1)"';
  const dir = project([[cmd, '.', '없음']]);
  run(dir, 'run', RUN_ID, cmd);
  assert.equal(run(dir, 'verify', RUN_ID).status, 0);
  writeFileSync(join(checksDir(dir), '01', 'stdout.txt'), 'tampered\n');
  const tampered = run(dir, 'verify', RUN_ID);
  assert.equal(tampered.status, 1);
  assert.match(tampered.stdout, /해시 불일치/);

  const dir2 = project([[cmd, '.', '없음']]);
  run(dir2, 'run', RUN_ID, cmd);
  writeFileSync(join(dir2, '.claude-team', 'runs', RUN_ID, 'plan.md'), `${plan([[cmd, '.', '없음']])}\n변경\n`);
  const changed = run(dir2, 'verify', RUN_ID);
  assert.equal(changed.status, 1);
  assert.match(changed.stdout, /기획안이 변경/);
});

test('검사 기록이 없으면 verify 실패', () => {
  const dir = project([['node -e "0"', '.', '없음']]);
  assert.equal(run(dir, 'verify', RUN_ID).status, 1);
});

test('diff는 추적·미추적 변경을 원문 그대로 저장하고 실행 산출물은 제외', () => {
  const dir = project([['node -e "0"', '.', '없음']]);
  writeFileSync(join(dir, 'a.txt'), 'base\nchanged\n');
  writeFileSync(join(dir, 'new.txt'), 'brand new\n');
  const result = run(dir, 'diff', RUN_ID);
  assert.equal(result.status, 0, result.stderr);
  const patch = readFileSync(join(dir, '.claude-team', 'runs', RUN_ID, 'changes.patch'), 'utf8');
  assert.match(patch, /\+changed/);
  assert.match(patch, /\+brand new/);
  assert.doesNotMatch(patch, /plan\.md/);
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(summary.trackedFiles, ['a.txt']);
  assert.deepEqual(summary.untrackedFiles, ['new.txt']);
});
