// team-guard hook 단위 검사, 임시 프로젝트에서 실행
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, symlinkSync, realpathSync, utimesSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = join(dirname(fileURLToPath(import.meta.url)), '..', 'template', '.claude', 'hooks', 'team-guard.mjs');
const RUN = 'R1';

function plan(status, rows) {
  const table = rows.map(([file, who]) => `| 1 | \`${file}\` | 아니오 | 수정 | ${who} |`).join('\n');
  return `# 기획안\n\n- runId: ${RUN}\n- 상태: ${status}\n\n## 6. 변경 계획\n\n| 순서 | 파일 | 새 파일 여부 | 작업 | 담당 |\n| --- | --- | --- | --- | --- |\n${table}\n\n- 금지 영역:\n\n## 7. 완료 기준\n`;
}

function project({ status = 'confirmed', rows = [['src/a.js', 'backend-agent'], ['test/a.test.js', 'test-agent'], ['src/*.js', 'backend-agent']] } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'team-guard-')));
  const runDir = join(dir, '.claude-team-docs', 'runs', RUN);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, 'request.md'), '요청\n');
  writeFileSync(join(runDir, 'plan.md'), plan(status, rows));
  mkdirSync(join(dir, 'src'), { recursive: true });
  return dir;
}

function guard(dir, input) {
  const result = spawnSync(process.execPath, [script], {
    cwd: dir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    input: typeof input === 'string' ? input : JSON.stringify({ cwd: dir, ...input }),
    encoding: 'utf8',
  });
  return { allowed: result.status === 0, status: result.status, stderr: result.stderr };
}

const write = (dir, agent, filePath) =>
  guard(dir, { hook_event_name: 'PreToolUse', tool_name: 'Write', agent_type: agent, tool_input: { file_path: filePath } });
const card = (extra = '') => `# 작업 카드\n\n- runId: ${RUN}\n${extra}`;
const call = (dir, caller, target, prompt = card(), toolUseId = 'toolu_1') =>
  guard(dir, { hook_event_name: 'PreToolUse', tool_name: 'Agent', agent_type: caller, tool_use_id: toolUseId, tool_input: { subagent_type: target, prompt } });
const post = (dir, target, toolUseId = 'toolu_1') =>
  guard(dir, { hook_event_name: 'PostToolUse', tool_name: 'Agent', tool_use_id: toolUseId, tool_input: { subagent_type: target } });
const reports = (name) => join('.claude-team-docs', 'runs', RUN, 'reports', name);

test('PM: 일반 파일과 요청·기획안은 허용, 보고·검사 기록·정책·git·가드는 거부', () => {
  const dir = project();
  assert.equal(write(dir, 'pm-agent', 'src/new.js').allowed, true);
  assert.equal(write(dir, undefined, 'src/new.js').allowed, true);
  assert.equal(write(dir, 'pm-agent', '.claude-team-docs/runs/R1/plan.md').allowed, true);
  assert.equal(write(dir, 'pm-agent', '.claude/team/profile.md').allowed, true);
  for (const p of [reports('planner-agent-01.md'), '.claude-team-docs/runs/R1/checks/01/record.json', '.claude/agents/pm-agent.md', '.claude/hooks/team-guard.mjs', '.claude/settings.json', '.git/config', '.claude-team-docs/.guard/writer.lock.json']) {
    assert.equal(write(dir, 'pm-agent', p).allowed, false, p);
  }
});

test('경로 이탈·절대 경로·UNC·symlink는 거부', () => {
  const dir = project();
  const outside = realpathSync(mkdtempSync(join(tmpdir(), 'outside-')));
  assert.equal(write(dir, 'pm-agent', '../x.txt').allowed, false);
  assert.equal(write(dir, 'pm-agent', join(outside, 'x.txt')).allowed, false);
  assert.equal(write(dir, 'pm-agent', '\\\\server\\share\\x.txt').allowed, false);
  symlinkSync(outside, join(dir, 'link'), 'junction');
  assert.equal(write(dir, 'pm-agent', 'link/x.txt').allowed, false);
});

test('분석·QA·리더는 자신의 보고·산출물에만 쓰기', () => {
  const dir = project();
  assert.equal(write(dir, 'planner-agent', reports('planner-agent-01.md')).allowed, true);
  assert.equal(write(dir, 'architecture-agent', reports('architecture-agent-02.md')).allowed, true);
  assert.equal(write(dir, 'planner-agent', reports('architecture-agent-01.md')).allowed, false);
  assert.equal(write(dir, 'planner-agent', 'src/a.js').allowed, false);
  assert.equal(write(dir, 'qa-agent', reports('qa-final.md')).allowed, true);
  assert.equal(write(dir, 'qa-agent', reports('qa-plan.md')).allowed, true);
  assert.equal(write(dir, 'qa-agent', reports('qa-final-01.md')).allowed, true, '재검증 순번');
  assert.equal(write(dir, 'qa-agent', reports('qa-extra.md')).allowed, false);
  assert.equal(write(dir, 'qa-agent', 'src/a.js').allowed, false);
  assert.equal(write(dir, 'planning-lead', '.claude-team-docs/runs/R1/plan.md').allowed, true);
  assert.equal(write(dir, 'planning-lead', 'src/a.js').allowed, false);
  assert.equal(write(dir, 'dev-lead', reports('dev-lead.md')).allowed, true);
  assert.equal(write(dir, 'dev-lead', '.claude-team-docs/runs/R1/plan.md').allowed, false);
  assert.equal(write(dir, 'planner-agent', '.claude-team-docs/runs/NOPE/reports/planner-agent-01.md').allowed, false);
});

test('실무 에이전트: 잠금·confirmed·배정 파일이 모두 맞을 때만 소스 쓰기', () => {
  const dir = project();
  assert.equal(write(dir, 'backend-agent', 'src/a.js').allowed, false, '잠금 없음');
  assert.equal(call(dir, 'pm-agent', 'backend-agent').allowed, true);
  assert.equal(write(dir, 'backend-agent', 'src/a.js').allowed, true);
  if (process.platform === 'win32') assert.equal(write(dir, 'backend-agent', 'src\\a.js').allowed, true, '역슬래시 경로');
  assert.equal(write(dir, 'backend-agent', 'test/a.test.js').allowed, false, '다른 역할 배정');
  assert.equal(write(dir, 'backend-agent', 'src/b.js').allowed, false, '미배정 파일');
  assert.equal(write(dir, 'backend-agent', 'src/other.js').allowed, false, 'glob 배정은 무효');
  assert.equal(write(dir, 'backend-agent', reports('backend-agent-01.md')).allowed, true, '자신의 보고');
  assert.equal(write(dir, 'frontend-agent', 'src/a.js').allowed, false, '다른 타입의 잠금');
});

test('기획안이 confirmed가 아니면 개발 호출과 소스 쓰기 거부', () => {
  const dir = project({ status: 'draft' });
  assert.equal(call(dir, 'pm-agent', 'backend-agent').allowed, false);
  assert.equal(call(dir, 'pm-agent', 'dev-lead').allowed, false);
  assert.equal(call(dir, 'pm-agent', 'planner-agent').allowed, true);
  const dir2 = project();
  call(dir2, 'pm-agent', 'backend-agent');
  writeFileSync(join(dir2, '.claude-team-docs', 'runs', RUN, 'plan.md'), plan('draft', [['src/a.js', 'backend-agent']]));
  assert.equal(write(dir2, 'backend-agent', 'src/a.js').allowed, false);
});

test('쓰기 에이전트 동시 호출 차단, 종료 후 해제, 오래된 잠금 대체', () => {
  const dir = project();
  assert.equal(call(dir, 'pm-agent', 'backend-agent', card(), 't1').allowed, true);
  const second = call(dir, 'pm-agent', 'test-agent', card(), 't2');
  assert.equal(second.allowed, false);
  assert.match(second.stderr, /실행 중/);
  assert.equal(post(dir, 'backend-agent', 'other').allowed, true);
  assert.equal(call(dir, 'pm-agent', 'test-agent', card(), 't3').allowed, false, '다른 tool_use_id의 Post는 해제하지 않음');
  assert.equal(post(dir, 'backend-agent', 't1').allowed, true);
  assert.equal(call(dir, 'pm-agent', 'test-agent', card(), 't4').allowed, true);

  const lock = join(dir, '.claude-team-docs', '.guard', 'writer.lock.json');
  const old = JSON.parse(readFileSync(lock, 'utf8'));
  writeFileSync(lock, JSON.stringify({ ...old, startedAt: Date.now() - 31 * 60 * 1000 }));
  assert.equal(call(dir, 'pm-agent', 'api-agent', card(), 't5').allowed, true, '오래된 잠금은 대체');
});

test('호출 인계 검사: runId·실행 단위 필수', () => {
  const dir = project();
  assert.equal(call(dir, 'pm-agent', 'planner-agent', '인계 없음').allowed, false);
  assert.equal(call(dir, 'pm-agent', 'planner-agent', '모드: final. runId R1. 작업 경로 x').allowed, true, '콜론 없는 표기');
  assert.equal(call(dir, 'pm-agent', 'planner-agent', 'runId=R1').allowed, true);
  assert.equal(call(dir, 'pm-agent', 'planner-agent', 'runId 가 없습니다').allowed, false);
  assert.equal(call(dir, 'pm-agent', 'planner-agent', '- runId: NOPE').allowed, false);
  assert.equal(call(dir, 'pm-agent', 'planner-agent').allowed, true);
});

test('리더의 호출 대상 제한과 final QA는 PM만', () => {
  const dir = project();
  assert.equal(call(dir, 'planning-lead', 'planner-agent').allowed, true);
  assert.equal(call(dir, 'planning-lead', 'qa-agent', card('- 모드: plan')).allowed, true);
  assert.equal(call(dir, 'planning-lead', 'qa-agent', card('- 모드: final')).allowed, false);
  assert.equal(call(dir, 'planning-lead', 'dev-lead').allowed, false);
  assert.equal(call(dir, 'planning-lead', 'backend-agent').allowed, false);
  assert.equal(call(dir, 'dev-lead', 'qa-agent').allowed, false);
  assert.equal(call(dir, 'dev-lead', 'planner-agent').allowed, false);
  assert.equal(call(dir, 'dev-lead', 'frontend-agent', card(), 't9').allowed, true);
  assert.equal(call(dir, 'planner-agent', 'backend-agent').allowed, false);
  assert.equal(call(dir, 'pm-agent', 'qa-agent', card('- 모드: final')).allowed, true);
});

test('이 팀 외의 에이전트는 팀 정책 파일만 보호하고 나머지는 간섭하지 않음', () => {
  const dir = project();
  assert.equal(write(dir, 'my-own-agent', 'src/anything.js').allowed, true);
  assert.equal(write(dir, 'my-own-agent', '.claude/agents/mine.md').allowed, true);
  assert.equal(write(dir, 'my-own-agent', '.claude/hooks/x.mjs').allowed, false);
  assert.equal(write(dir, 'my-own-agent', '.claude/agents/pm-agent.md').allowed, false);
  assert.equal(call(dir, 'my-own-agent', 'some-other-agent', '인계 없음').allowed, true);
});

test('오류와 잘못된 입력은 차단(fail closed)', () => {
  const dir = project();
  assert.equal(guard(dir, '{not json').status, 2);
  assert.equal(guard(dir, { hook_event_name: 'PreToolUse', tool_name: 'Write', agent_type: 'pm-agent', tool_input: {} }).status, 2);
  assert.equal(existsSync(join(dir, '.claude-team-docs', '.guard', 'writer.lock.json')), false);
  const missingRoot = spawnSync(process.execPath, [script], { cwd: dir, env: { ...process.env, CLAUDE_PROJECT_DIR: join(dir, 'nope') }, input: '{}', encoding: 'utf8' });
  assert.equal(missingRoot.status, 2);
});

test('기획안 표의 이스케이프하지 않은 파이프는 배정을 어긋나게 해 거부하고 안내', () => {
  const bad = project({ rows: [['src/<a|b>.js', 'backend-agent']] });
  call(bad, 'pm-agent', 'backend-agent');
  const denied = write(bad, 'backend-agent', 'src/<a|b>.js');
  assert.equal(denied.allowed, false);
  assert.match(denied.stderr, /6장 표/);
  const good = project({ rows: [['src/<x>.js', 'backend-agent']] });
  call(good, 'pm-agent', 'backend-agent');
  assert.equal(write(good, 'backend-agent', 'src/<x>.js').allowed, true);
});
