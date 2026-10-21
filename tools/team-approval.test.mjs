// 엄격 모드의 승인 추적·범위 제한 회귀 검사, 실제 Claude·사용자 실행 인증과 구분
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = join(dirname(fileURLToPath(import.meta.url)), '..', 'template/.claude');
const approval = join(base, 'team/bin/team-approval.mjs');
const guardScript = join(base, 'hooks/team-guard.mjs');
const checkScript = join(base, 'team/bin/team-check.mjs');
const command = `"${process.execPath}" -e "console.log('approved check')"`;

function run(script, dir, args, input) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: dir, env: { ...process.env, CLAUDE_PROJECT_DIR: dir }, input: input && JSON.stringify(input), encoding: 'utf8' });
  let json;
  try { json = JSON.parse(result.stdout); } catch { /* 거부 사유는 stderr 확인 */ }
  return { status: result.status, json, stderr: result.stderr };
}
const cli = (dir, ...args) => run(approval, dir, args);
const guard = (dir, input) => run(guardScript, dir, [], { cwd: dir, permission_mode: 'default', hook_event_name: 'PreToolUse', ...input });
const write = (dir, file, role = 'pm-agent', extra = {}) => guard(dir, { tool_name: 'Write', agent_type: role, tool_input: { file_path: file }, ...extra });
const call = (dir) => guard(dir, { tool_name: 'Agent', agent_type: 'pm-agent', tool_use_id: 'write-1', tool_input: { subagent_type: 'backend-agent', prompt: '- runId: R1', run_in_background: false } });
const location = (dir, name) => join(dir, '.claude-team-docs/.guard', name);
const planPath = (dir) => join(dir, '.claude-team-docs/runs/R1/plan.md');
const getJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

function plan({ risk = 'L2', required = 'none', file = 'src/a.js', owner = 'backend-agent', checks = true } = {}) {
  return `# Plan\n- runId: R1\n- Risk: ${risk}\n- Status: confirmed\n\n## 6. 변경 계획\n| Order | File | New file | Work | Owner |\n| --- | --- | --- | --- | --- |\n| 1 | ${file} | 아니오 | modify | ${owner} |\n\n## 8. 검사 명령\n| Command | Working directory | Side effects |\n| --- | --- | --- |\n${checks ? `| ${command} | . | none |\n` : ''}\n## 10. Items requiring user approval 항목\n- User approval required: ${required}\n\n## 11. 근거\n근거\n`;
}

function fixture(options = {}, scope = {}) {
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'team-strict-')));
  mkdirSync(join(dir, '.claude/team'), { recursive: true });
  mkdirSync(join(dir, '.claude-team-docs/runs/R1'), { recursive: true });
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, '.claude/team/profile.md'), '- Protection mode: strict\n');
  writeFileSync(join(dir, '.claude-team-docs/runs/R1/request.md'), '원문 요청\n');
  writeFileSync(planPath(dir), plan(options));
  writeFileSync(join(dir, 'grant-draft.json'), JSON.stringify({ roots: ['src', 'test'], operations: ['modify', 'create'], forbidden: ['src/private'], checks: [{ command, cwd: '.', sideEffects: 'none' }], allowPmConfirm: true, ...scope }));
  const review = cli(dir, 'review-grant', 'grant-draft.json');
  assert.equal(review.status, 0, review.stderr);
  const grant = cli(dir, 'grant', 'grant-draft.json', '--hash', review.json.sha256);
  assert.equal(grant.status, 0, grant.stderr);
  return dir;
}

function approve(dir) {
  const review = cli(dir, 'review-plan', 'R1');
  assert.equal(review.status, 0, review.stderr);
  const approved = cli(dir, 'approve', 'R1', '--hash', review.json.planSha256);
  assert.equal(approved.status, 0, approved.stderr);
}

function register(dir) {
  const registered = cli(dir, 'register', 'R1');
  assert.equal(registered.status, 0, registered.stderr);
  return registered.json;
}

test('엄격 모드는 등록 없으면 소스 쓰기·개발 호출 거부', () => {
  const dir = fixture();
  assert.equal(write(dir, 'src/a.js').status, 2);
  assert.equal(call(dir).status, 2);
  assert.equal(write(dir, '.claude-team-docs/runs/R1/plan.md').status, 0);
});

test('PM 자체 컨펌은 허용 범위 내 L2와 명시적인 승인 불필요 표식에 한정', () => {
  const dir = fixture();
  assert.equal(register(dir).confirmedBy, 'pm-agent');
  assert.equal(call(dir).status, 0);
  assert.equal(write(dir, 'src/a.js', 'backend-agent').status, 0);
  assert.equal(write(dir, 'src/other.js', 'backend-agent').status, 2);
  assert.equal(write(dir, 'src/a.js').status, 2);
});

test('L3·승인 필요 항목·자체 컨펌 비허용은 직접 승인 전 등록 거부', () => {
  for (const [options, scope] of [[{ risk: 'L3' }, {}], [{ required: '있음' }, {}], [{}, { allowPmConfirm: false }]]) {
    const dir = fixture(options, scope);
    assert.equal(cli(dir, 'register', 'R1').status, 2);
    approve(dir);
    assert.equal(register(dir).confirmedBy, 'user');
    assert.equal(cli(dir, 'verify', 'R1').status, 0);
  }
});

test('approved=true 문서만으로 직접 승인 대체 불가', () => {
  const dir = fixture({ risk: 'L3' });
  writeFileSync(location(dir, 'approval-R1.json'), JSON.stringify({ approved: true }));
  assert.equal(cli(dir, 'register', 'R1').status, 2);
});

test('승인 범위 밖·금지·정책·glob·중복 배정·미승인 검사 명령 거부', () => {
  for (const file of ['outside/a.js', 'src/private/key.js', '.claude/settings.json', '../outside.js', 'src/*.js']) {
    const dir = fixture({ file });
    assert.equal(cli(dir, 'review-plan', 'R1').status, 2, file);
  }
  const duplicate = fixture();
  writeFileSync(planPath(duplicate), plan().replace('## 8.', '| 2 | src/a.js | 아니오 | modify | frontend-agent |\n\n## 8.'));
  assert.equal(cli(duplicate, 'review-plan', 'R1').status, 2);
  const badCheck = fixture();
  writeFileSync(planPath(badCheck), plan().replace(command, 'npm run unapproved'));
  assert.equal(cli(badCheck, 'review-plan', 'R1').status, 2);
});

test('계획·요청·grant 변경은 활성 등록과 과거 직접 승인을 무효화', () => {
  for (const target of ['plan', 'request', 'grant']) {
    const dir = fixture({ risk: 'L3' });
    approve(dir);
    register(dir);
    if (target === 'plan') writeFileSync(planPath(dir), plan({ risk: 'L3' }) + '\n변경');
    if (target === 'request') writeFileSync(join(dir, '.claude-team-docs/runs/R1/request.md'), '다른 요청');
    if (target === 'grant') {
      const file = location(dir, 'grant.json');
      const grant = getJson(file);
      grant.id = 'changed';
      writeFileSync(file, JSON.stringify(grant));
    }
    assert.equal(cli(dir, 'verify', 'R1').status, 2, target);
    assert.equal(call(dir).status, 2, target);
    assert.equal(cli(dir, 'register', 'R1').status, 2, target);
  }
});

test('직접 승인 기록 변조와 검토 해시 불일치는 거부', () => {
  const dir = fixture({ risk: 'L3' });
  approve(dir);
  register(dir);
  const file = location(dir, 'approval-R1.json');
  const receipt = getJson(file);
  receipt.id = 'changed';
  writeFileSync(file, JSON.stringify(receipt));
  assert.equal(cli(dir, 'verify', 'R1').status, 2);
  assert.equal(cli(dir, 'approve', 'R1', '--hash', 'wrong').status, 2);
  assert.equal(cli(dir, 'grant', 'grant-draft.json', '--hash', 'wrong').status, 2);
});

test('엄격 모드 main·비표준 권한 모드·정책 파일 보호', () => {
  const dir = fixture({ owner: 'pm-agent', risk: 'L1', checks: false });
  register(dir);
  assert.equal(write(dir, 'src/a.js').status, 0);
  for (const permission_mode of ['acceptEdits', 'auto', 'bypassPermissions', 'dontAsk', 'plan', undefined]) {
    assert.equal(write(dir, 'src/a.js', 'pm-agent', { permission_mode }).status, 2, permission_mode);
  }
  for (const file of ['.claude/team/profile.md', '.claude-team-docs/.guard/grant.json', '.claude-team-docs/.guard/active-registration.json']) {
    assert.equal(write(dir, file).status, 2, file);
  }
});

test('엄격 모드 검사 실행과 검증은 현재 등록과 기록 해시를 대조', () => {
  const dir = fixture();
  assert.equal(run(checkScript, dir, ['run', 'R1', command]).status, 2);
  register(dir);
  const result = run(checkScript, dir, ['run', 'R1', command]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(run(checkScript, dir, ['verify', 'R1']).status, 0);
  const index = readdirSync(join(dir, '.claude-team-docs/runs/R1/checks'))[0];
  const recordPath = join(dir, '.claude-team-docs/runs/R1/checks', index, 'record.json');
  const record = getJson(recordPath);
  record.exitCode = 7;
  writeFileSync(recordPath, JSON.stringify(record));
  const verified = run(checkScript, dir, ['verify', 'R1']);
  assert.equal(verified.status, 1);
  assert.match(JSON.stringify(verified.json), /check record hash mismatch/);
});

test('등록 해제와 새 승인 범위 기록 이후 쓰기 차단', () => {
  const dir = fixture({ owner: 'pm-agent' });
  register(dir);
  assert.equal(cli(dir, 'revoke', 'R1').status, 0);
  assert.equal(write(dir, 'src/a.js').status, 2);
  register(dir);
  const review = cli(dir, 'review-grant', 'grant-draft.json');
  assert.equal(cli(dir, 'grant', 'grant-draft.json', '--hash', review.json.sha256).status, 0);
  assert.equal(write(dir, 'src/a.js').status, 2);
});

test('엄격 모드의 미등록 역할 쓰기·호출과 미승인 작업 종류는 거부', () => {
  const dir = fixture();
  register(dir);
  assert.equal(write(dir, 'src/a.js', 'custom-agent').status, 2);
  assert.equal(guard(dir, { tool_name: 'Agent', tool_input: { subagent_type: 'custom-agent' } }).status, 2);
  const createOnly = fixture({}, { operations: ['create'] });
  assert.equal(cli(createOnly, 'register', 'R1').status, 2);
});
