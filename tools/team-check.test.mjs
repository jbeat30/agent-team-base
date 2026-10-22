// team-check 실행기 단위 검사, 임시 프로젝트에서 실행
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = join(dirname(fileURLToPath(import.meta.url)), '..', 'template', '.claude', 'team', 'bin', 'team-check.mjs');
const RUN_ID = '20260101-0000-test';

function plan(rows) {
  const table = rows.map(([c, cwd, effect]) => `| \`${c}\` | ${cwd} | ${effect} |`).join('\n');
  return `# Plan\n\n## 7. 완료 기준\n\n| a |\n\n## 8. 검사 명령과 부작용 분류\n\n| Command | Working directory | Side effects |\n| --- | --- | --- |\n${table}\n\n## 9. 완료 체크리스트\n`;
}

function project(rows) {
  const dir = mkdtempSync(join(tmpdir(), 'team-check-'));
  const git = (...args) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: dir });
  git('init', '-q');
  writeFileSync(join(dir, 'a.txt'), 'base\n');
  git('add', '-A');
  git('commit', '-qm', 'base');
  mkdirSync(join(dir, '.claude-team-docs', 'runs', RUN_ID), { recursive: true });
  writeFileSync(join(dir, '.claude-team-docs', 'runs', RUN_ID, 'plan.md'), plan(rows));
  return dir;
}

const run = (dir, ...args) => spawnSync(process.execPath, [script, ...args], { cwd: dir, encoding: 'utf8' });
const checksDir = (dir) => join(dir, '.claude-team-docs', 'runs', RUN_ID, 'checks');

test('승인된 명령을 실행하고 exit code와 원본 출력을 기록', () => {
  const cmd = `node -e "console.log('hello');process.exit(3)"`;
  const dir = project([[cmd, '.', 'none']]);
  const result = run(dir, 'run', RUN_ID, cmd);
  assert.equal(result.status, 0, result.stderr);
  const record = JSON.parse(readFileSync(join(checksDir(dir), '01', 'record.json'), 'utf8'));
  assert.equal(record.exitCode, 3);
  assert.equal(record.command, cmd);
  assert.match(readFileSync(join(checksDir(dir), '01', 'stdout.txt'), 'utf8'), /hello/);
  assert.equal(run(dir, 'verify', RUN_ID).status, 0);
});

test('기획안에 없는 명령은 실행하지 않음', () => {
  const dir = project([['node -e "0"', '.', 'none']]);
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
  const dir = project([[cmd, '../outside', 'none']]);
  assert.equal(run(dir, 'run', RUN_ID, cmd).status, 2);
});

test('출력 변조와 기획안 변경을 verify가 탐지', () => {
  const cmd = 'node -e "console.log(1)"';
  const dir = project([[cmd, '.', 'none']]);
  run(dir, 'run', RUN_ID, cmd);
  assert.equal(run(dir, 'verify', RUN_ID).status, 0);
  writeFileSync(join(checksDir(dir), '01', 'stdout.txt'), 'tampered\n');
  const tampered = run(dir, 'verify', RUN_ID);
  assert.equal(tampered.status, 1);
  assert.match(tampered.stdout, /hash mismatch/);

  const dir2 = project([[cmd, '.', 'none']]);
  run(dir2, 'run', RUN_ID, cmd);
  writeFileSync(join(dir2, '.claude-team-docs', 'runs', RUN_ID, 'plan.md'), `${plan([[cmd, '.', 'none']])}\n변경\n`);
  const changed = run(dir2, 'verify', RUN_ID);
  assert.equal(changed.status, 1);
  assert.match(changed.stdout, /the plan changed/);
});

test('검사 기록이 없으면 verify 실패', () => {
  const dir = project([['node -e "0"', '.', 'none']]);
  assert.equal(run(dir, 'verify', RUN_ID).status, 1);
});

test('diff는 추적·미추적 변경을 원문 그대로 저장하고 실행 산출물은 제외', () => {
  const dir = project([['node -e "0"', '.', 'none']]);
  writeFileSync(join(dir, 'a.txt'), 'base\nchanged\n');
  writeFileSync(join(dir, 'new.txt'), 'brand new\n');
  const result = run(dir, 'diff', RUN_ID);
  assert.equal(result.status, 0, result.stderr);
  const patch = readFileSync(join(dir, '.claude-team-docs', 'runs', RUN_ID, 'changes.patch'), 'utf8');
  assert.match(patch, /\+changed/);
  assert.match(patch, /\+brand new/);
  assert.doesNotMatch(patch, /plan\.md/);
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(summary.trackedFiles, ['a.txt']);
  assert.deepEqual(summary.untrackedFiles, ['new.txt']);
});

const CMD = 'node -e "0"';
const REQUEST = '로그인 화면에 비밀번호 보기 버튼을 추가한다.\n새로고침해도 입력은 유지한다.';
const R1 = ['R1', '비밀번호 보기 버튼', '비밀번호 보기 버튼을 추가한다'];
const R2 = ['R2', '입력 유지', '새로고침해도 입력은 유지한다'];

function tracePlan({ quote = REQUEST, rows = [R1, R2], done = ['R1', 'R2'], files = [['src/login.js', 'frontend-agent']] } = {}) {
  const q = quote.split('\n').map((l) => `> ${l}`).join('\n');
  const req = rows.map(([id, r, e]) => `| ${id} | ${r} | "${e}" |`).join('\n');
  const dn = done.map((id) => `| ${id} | 로그인 화면 | 확인 | 동작 | 화면 확인 |`).join('\n');
  const ch = files.map(([f, who], i) => `| ${i + 1} | \`${f}\` | 아니오 | modify | ${who} |`).join('\n');
  return `# Plan\n\n## 1. User request source\n\n${q}\n\n## 2. 요구사항 목록\n\n| ID | 요구 | 원문 근거(인용) |\n| --- | --- | --- |\n${req}\n\n## 6. 변경 계획\n\n| Order | File | New file | Work | Owner |\n| --- | --- | --- | --- | --- |\n${ch}\n\n## 7. 완료 기준\n\n| ID | Given | When | Then | 검증 방법 |\n| --- | --- | --- | --- | --- |\n${dn}\n\n## 8. 검사 명령과 부작용 분류\n\n| Command | Working directory | Side effects |\n| --- | --- | --- |\n| \`${CMD}\` | . | none |\n`;
}

function cardText({ quote = REQUEST, ids = 'R1, R2', files = 'src/login.js', hash = '' } = {}) {
  const q = quote.split('\n').map((l) => `> ${l}`).join('\n');
  return `# 작업 카드\n\n- runId: ${RUN_ID}\n- Plan path and hash: \`plan.md\`, ${hash}\n- Allowed files (exact paths): ${files}\n- Assigned requirements and completion criteria IDs: ${ids}\n\n## Request source\n\n${q}\n`;
}

function traceProject({ planOpts, card, report, patch } = {}) {
  const dir = project([[CMD, '.', 'none']]);
  const runDir = join(dir, '.claude-team-docs', 'runs', RUN_ID);
  writeFileSync(join(runDir, 'request.md'), REQUEST);
  const text = tracePlan(planOpts);
  writeFileSync(join(runDir, 'plan.md'), text);
  const planHash = createHash('sha256').update(text).digest('hex');
  if (card) {
    mkdirSync(join(runDir, 'cards'), { recursive: true });
    writeFileSync(join(runDir, 'cards', card.name ?? '01-frontend-agent.md'), cardText({ hash: planHash, ...card.opts }));
  }
  if (report) {
    mkdirSync(join(runDir, 'reports'), { recursive: true });
    writeFileSync(join(runDir, 'reports', 'dev-lead.md'), report);
  }
  if (patch) writeFileSync(join(runDir, 'changes.patch'), patch);
  return dir;
}

const trace = (dir) => {
  const result = run(dir, 'trace', RUN_ID);
  return { status: result.status, json: JSON.parse(result.stdout) };
};

test('trace: 요구·카드·보고·diff가 기획안과 일치하면 통과', () => {
  const dir = traceProject({
    card: {},
    report: 'R1 완료\nR2 완료\n',
    patch: 'diff --git a/src/login.js b/src/login.js\n+x\n',
  });
  const result = trace(dir);
  assert.equal(result.status, 0, JSON.stringify(result.json));
  assert.equal(result.json.requirements, 2);
});

test('trace: 실행 기록 파일(plan.md 등)을 허용 파일로 적은 카드는 소스 파일 비교에서 제외', () => {
  const recordFile = `.claude-team-docs/runs/${RUN_ID}/plan.md`;
  const ok = trace(traceProject({ card: { name: '01-planning-lead.md', opts: { files: recordFile } } }));
  assert.equal(ok.status, 0, JSON.stringify(ok.json));
  const sourceOutside = trace(traceProject({ card: { name: '01-planning-lead.md', opts: { files: `${recordFile}, src/other.js` } } }));
  assert.equal(sourceOutside.status, 1, '계획에 없는 소스 파일은 계속 탐지');
  assert.match(JSON.stringify(sourceOutside.json), /src\/other\.js/);
});

test('trace: 기획안의 요구 누락·원문 변형을 탐지', () => {
  const dropped = trace(traceProject({ planOpts: { quote: '로그인 화면에 비밀번호 보기 버튼을 추가한다.' } }));
  assert.equal(dropped.status, 1);
  assert.ok(dropped.json.problems.includes('plan section 1 does not contain the full request source'));

  const reworded = trace(traceProject({ planOpts: { rows: [['R1', '버튼', '비밀번호 표시 토글을 만든다'], R2] } }));
  assert.equal(reworded.status, 1);
  assert.ok(reworded.json.problems.includes('R1: the source quote is not in request.md'));

  const noDone = trace(traceProject({ planOpts: { done: ['R1'] } }));
  assert.ok(noDone.json.problems.includes('R2: no completion criteria in section 7'));

  const orphan = trace(traceProject({ planOpts: { rows: [R1], done: ['R1', 'R2'] } }));
  assert.ok(orphan.json.problems.includes('R2: completion criteria for an ID not in section 2'));
});

test('trace: 카드의 원문 축약·요구 ID·Allowed files·담당 이탈을 탐지', () => {
  const short = trace(traceProject({ card: { opts: { quote: '비밀번호 보기 버튼 추가' } } }));
  assert.ok(short.json.problems.some((p) => p.includes('request source differs from request.md')));

  const unknownId = trace(traceProject({ card: { opts: { ids: 'R1, R2, R9' } } }));
  assert.ok(unknownId.json.problems.some((p) => p.includes('requirement not in the plan R9')));

  const extraFile = trace(traceProject({ card: { opts: { files: 'src/login.js, src/auth.js' } } }));
  assert.ok(extraFile.json.problems.some((p) => p.includes('file not in plan section 6 src/auth.js')));

  const wrongOwner = trace(traceProject({ card: { name: '01-backend-agent.md' } }));
  assert.ok(wrongOwner.json.problems.some((p) => p.includes('is owned by frontend-agent, but the card receiver is backend-agent')));

  const uncovered = trace(traceProject({ card: { opts: { ids: 'R1' } } }));
  assert.ok(uncovered.json.problems.includes('R2: not assigned to any worker card'));

  const stale = traceProject({ card: {} });
  const planPath = join(stale, '.claude-team-docs', 'runs', RUN_ID, 'plan.md');
  writeFileSync(planPath, `${readFileSync(planPath, 'utf8')}\n변경\n`);
  assert.ok(trace(stale).json.problems.some((p) => p.includes('plan hash differs from the current plan')));
});

test('trace: 보고의 요구 누락과 계획 밖 diff 파일을 탐지', () => {
  const result = trace(traceProject({ report: 'R1 완료\n', patch: 'diff --git a/src/login.js b/src/login.js\n+x\ndiff --git a/src/other.js b/src/other.js\n+y\n' }));
  assert.equal(result.status, 1);
  assert.ok(result.json.problems.includes('reports/dev-lead.md: R2 not mentioned'));
  assert.ok(result.json.problems.includes('changes.patch: changed file not in plan section 6 src/other.js'));
});
