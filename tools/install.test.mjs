// 설치 스크립트 단위 검사, 임시 프로젝트에서 실행하며 실제 Claude는 사용하지 않음
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, realpathSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, '..', 'scripts', 'install.mjs');
const fakeClaude = join(realpathSync(mkdtempSync(join(tmpdir(), 'fake-claude-'))), 'claude.mjs');
writeFileSync(fakeClaude, "console.log(process.env.FAKE_CLAUDE_VERSION ?? '2.1.302 (Claude Code)');\n");

const temp = (prefix = 'team-install-') => realpathSync(mkdtempSync(join(tmpdir(), prefix)));
const answersFor = (over = {}) => ({ profile: 'full', context7: true, gitignore: true, pdca: 'off', stack: [{ item: 'Node.js', value: 'npm', evidence: 'package.json' }], checks: [{ purpose: '테스트', command: 'npm test', cwd: '.', sideEffect: '없음(추정)' }], conventions: [], forbidden: [{ path: 'dist/', reason: '생성 파일' }], ...over });

function project(files = {}) {
  const dir = temp();
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  }
  return dir;
}

function install(args, env = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    env: { ...process.env, TEAM_CLAUDE_BIN: `"${process.execPath}" "${fakeClaude}"`, ...env },
  });
  let json = null;
  try {
    json = JSON.parse(result.stdout);
  } catch {
    // 오류 출력은 stderr로 확인
  }
  return { status: result.status, json, stderr: result.stderr };
}

function answersFile(over) {
  const file = join(temp('answers-'), 'answers.json');
  writeFileSync(file, JSON.stringify(answersFor(over)));
  return file;
}

const planArgs = (dir, file, extra = []) => ['plan', '--target', dir, '--answers', file, ...extra];
const applyArgs = (dir, file, hash, extra = []) => ['apply', '--target', dir, '--answers', file, '--plan-hash', hash, ...extra];

function installFresh(files = {}, over = {}, extra = []) {
  const dir = project(files);
  const file = answersFile(over);
  const plan = install(planArgs(dir, file, extra));
  const applied = install(applyArgs(dir, file, plan.json.hash, extra));
  return { dir, file, plan, applied };
}

test('detect: 스택·검사 명령·부작용 분류를 읽기 전용으로 감지', () => {
  const dir = project({
    'package.json': { name: 'a', scripts: { test: 'jest', lint: 'eslint . --fix' }, dependencies: { react: '^18.0.0' } },
    'pnpm-lock.yaml': '',
    'pyproject.toml': '[tool.pytest]\n',
    'go.mod': 'module x\n\ngo 1.22\n',
    'CONTRIBUTING.md': '# x',
  });
  const { json } = install(['detect', '--target', dir]);
  assert.deepEqual(json.stacks.map((s) => s.item).sort(), ['Go', 'JavaScript/TypeScript (Node.js)', 'Python']);
  const byPurpose = Object.fromEntries(json.suggestedChecks.filter((c) => c.evidence.startsWith('package.json')).map((c) => [c.purpose, c]));
  assert.equal(byPurpose['테스트'].command, 'pnpm test');
  assert.match(byPurpose['린트'].sideEffect, /^있음/);
  assert.ok(json.suggestedChecks.some((c) => c.command === 'go test ./...'));
  assert.deepEqual(json.conventionFiles, ['CONTRIBUTING.md']);
  assert.equal(json.existing.installed, false);
  assert.equal(readdirSync(dir).includes('.claude'), false, 'detect는 파일을 만들지 않음');
});

test('plan은 결정적이고 apply는 plan 해시가 맞을 때만 적용', () => {
  const dir = project();
  const file = answersFile();
  const a = install(planArgs(dir, file));
  const b = install(planArgs(dir, file));
  assert.equal(a.json.hash, b.json.hash);
  assert.equal(a.json.ok, true);
  assert.ok(a.json.summary.length <= 10);
  assert.equal(readdirSync(dir).length, 0, 'plan은 파일을 만들지 않음');
  const wrong = install(applyArgs(dir, file, 'deadbeef'));
  assert.equal(wrong.status, 1);
  assert.equal(readdirSync(dir).length, 0);
  const changed = install(applyArgs(dir, answersFile({ profile: 'lite' }), a.json.hash));
  assert.equal(changed.status, 1, '답변이 바뀌면 거부');
});

test('신규 설치: 파일·settings·MCP·gitignore·프로필·매니페스트 생성 후 verify 통과', () => {
  const { dir, applied } = installFresh();
  assert.equal(applied.json.ok, true, applied.stderr);
  for (const role of ['pm-agent', 'planning-lead', 'dev-lead', 'qa-agent']) assert.ok(existsSync(join(dir, '.claude', 'agents', `${role}.md`)));
  assert.ok(existsSync(join(dir, '.claude', 'hooks', 'team-guard.mjs')));
  assert.ok(existsSync(join(dir, '.claude', 'team', 'bin', 'team-check.mjs')));
  assert.equal(existsSync(join(dir, '.claude', 'team', 'profile.template.md')), false);
  assert.equal(existsSync(join(dir, '.claude', 'settings.fragment.json')), false);
  const settings = JSON.parse(readFileSync(join(dir, '.claude', 'settings.json'), 'utf8'));
  assert.equal(settings.agent, 'pm-agent');
  assert.ok(settings.hooks.PreToolUse[0].hooks[0].command.includes('team-guard.mjs'));
  assert.equal(JSON.parse(readFileSync(join(dir, '.mcp.json'), 'utf8')).mcpServers.context7.command, 'npx');
  assert.match(readFileSync(join(dir, '.gitignore'), 'utf8'), /\.claude-team-docs\//);
  const profile = readFileSync(join(dir, '.claude', 'team', 'profile.md'), 'utf8');
  assert.match(profile, /실행 프로파일: full/);
  assert.match(profile, /`npm test`/);
  assert.match(profile, /dist\//);
  const verified = install(['verify', '--target', dir]);
  assert.equal(verified.json.ok, true, JSON.stringify(verified.json));
  const status = Object.fromEntries(verified.json.checks.map((c) => [c.name, c.status]));
  assert.equal(status['guard canary'], 'pass');
  assert.equal(status['guard live'], 'unverified', 'live 확인 전에는 미확인');
});

test('재적용은 변경 없음(멱등)', () => {
  const { dir, file } = installFresh();
  const plan = install(planArgs(dir, file));
  assert.ok(plan.json.files.every((f) => f.action === 'unchanged'));
  assert.equal(plan.json.settings.action, 'unchanged');
  assert.equal(plan.json.mcp.action, 'already');
  assert.equal(plan.json.gitignore.action, 'already');
  assert.equal(install(applyArgs(dir, file, plan.json.hash)).json.ok, true);
});

test('기존 다른 파일과 충돌하면 결정을 요구하고 skip·백업 교체를 지원', () => {
  const dir = project({ '.claude/agents/pm-agent.md': '내 PM 에이전트\n' });
  const file = answersFile();
  const plan = install(planArgs(dir, file));
  assert.equal(plan.json.ok, false);
  assert.equal(plan.json.conflicts[0].item, '.claude/agents/pm-agent.md');
  assert.equal(install(applyArgs(dir, file, plan.json.hash)).status, 1, '충돌 방식 없이는 거부');

  const skipPlan = install(planArgs(dir, file, ['--on-conflict', 'skip']));
  const skipped = install(applyArgs(dir, file, skipPlan.json.hash, ['--on-conflict', 'skip']));
  assert.equal(skipped.json.ok, true);
  assert.equal(readFileSync(join(dir, '.claude', 'agents', 'pm-agent.md'), 'utf8'), '내 PM 에이전트\n');
  assert.equal(skipped.json.skipped[0].path, '.claude/agents/pm-agent.md');

  const dir2 = project({ '.claude/agents/pm-agent.md': '내 PM 에이전트\n' });
  const replacePlan = install(planArgs(dir2, file, ['--on-conflict', 'replace-with-backup']));
  const replaced = install(applyArgs(dir2, file, replacePlan.json.hash, ['--on-conflict', 'replace-with-backup']));
  assert.match(readFileSync(join(dir2, '.claude', 'agents', 'pm-agent.md'), 'utf8'), /name: pm-agent/);
  assert.equal(readFileSync(join(dir2, replaced.json.backups, '.claude', 'agents', 'pm-agent.md'), 'utf8'), '내 PM 에이전트\n');
});

test('기존 settings: 사용자 hook·agent 설정 보존, agent 충돌은 명시 결정 필요, 제거 시 사용자 항목 유지', () => {
  const userSettings = { agent: 'my-agent', permissions: { allow: ['Bash(ls)'] }, hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo user' }] }] } };
  const dir = project({ '.claude/settings.json': userSettings });
  const file = answersFile();
  const plan = install(planArgs(dir, file, ['--on-conflict', 'skip']));
  assert.equal(plan.json.conflicts.some((c) => c.item === 'settings.agent'), true);
  assert.equal(install(applyArgs(dir, file, plan.json.hash, ['--on-conflict', 'skip'])).status, 1, 'on-conflict로는 agent 충돌을 넘길 수 없음');

  const keepFile = answersFile({ agentSetting: 'keep' });
  const keepPlan = install(planArgs(dir, keepFile));
  assert.equal(keepPlan.json.ok, true, JSON.stringify(keepPlan.json.conflicts));
  assert.equal(install(applyArgs(dir, keepFile, keepPlan.json.hash)).json.ok, true);
  const merged = JSON.parse(readFileSync(join(dir, '.claude', 'settings.json'), 'utf8'));
  assert.equal(merged.agent, 'my-agent');
  assert.deepEqual(merged.permissions, userSettings.permissions);
  assert.equal(merged.hooks.PreToolUse.length, 2);
  const verified = install(['verify', '--target', dir]);
  assert.equal(Object.fromEntries(verified.json.checks.map((c) => [c.name, c.status]))['settings agent'], 'unverified');

  assert.equal(install(['remove', '--target', dir, '--yes']).json.ok, true);
  const after = JSON.parse(readFileSync(join(dir, '.claude', 'settings.json'), 'utf8'));
  assert.deepEqual(after, userSettings);
});

test('agent 설정 replace는 제거 시 원래 값으로 복원', () => {
  const dir = project({ '.claude/settings.json': { agent: 'my-agent' } });
  const file = answersFile({ agentSetting: 'replace' });
  const plan = install(planArgs(dir, file));
  install(applyArgs(dir, file, plan.json.hash));
  assert.equal(JSON.parse(readFileSync(join(dir, '.claude', 'settings.json'), 'utf8')).agent, 'pm-agent');
  install(['remove', '--target', dir, '--yes']);
  assert.equal(JSON.parse(readFileSync(join(dir, '.claude', 'settings.json'), 'utf8')).agent, 'my-agent');
});

test('해석할 수 없는 settings.json은 진행 불가', () => {
  const dir = project({ '.claude/settings.json': '{ broken' });
  const plan = install(planArgs(dir, answersFile()));
  assert.equal(plan.json.ok, false);
  assert.match(plan.json.blockers[0], /해석 불가/);
  assert.equal(install(applyArgs(dir, answersFile(), plan.json.hash)).status, 1);
});

test('Claude Code 최소 버전 미만이면 진행 불가, 확인 불가는 미확인으로 계속', () => {
  const dir = project();
  const file = answersFile();
  const below = install(planArgs(dir, file), { FAKE_CLAUDE_VERSION: '2.1.100 (Claude Code)' });
  assert.equal(below.json.ok, false);
  assert.match(below.json.blockers[0], /최소/);
  assert.equal(install(applyArgs(dir, file, below.json.hash), { FAKE_CLAUDE_VERSION: '2.1.100' }).status, 1);
  const unknown = install(planArgs(dir, file), { FAKE_CLAUDE_VERSION: '버전 없음' });
  assert.equal(unknown.json.ok, true);
});

test('제거: 기본은 dry-run, 설치한 항목만 제거하고 사용자 수정 파일은 보존', () => {
  const { dir } = installFresh({ '.gitignore': 'node_modules/\n' });
  writeFileSync(join(dir, '.claude', 'team', 'profile.md'), '사용자가 고친 프로필\n');
  const dry = install(['remove', '--target', dir]);
  assert.equal(dry.json.dryRun, true);
  assert.ok(existsSync(join(dir, '.claude', 'agents', 'pm-agent.md')));
  const real = install(['remove', '--target', dir, '--yes']);
  assert.equal(real.json.ok, true);
  assert.deepEqual(real.json.kept.map((k) => k.path), ['.claude/team/profile.md']);
  assert.equal(existsSync(join(dir, '.claude', 'agents')), false);
  assert.equal(existsSync(join(dir, '.claude', 'hooks')), false);
  assert.equal(readFileSync(join(dir, '.claude', 'team', 'profile.md'), 'utf8'), '사용자가 고친 프로필\n');
  assert.equal(existsSync(join(dir, '.claude', 'settings.json')), false, '우리가 만든 settings는 삭제');
  assert.equal(existsSync(join(dir, '.mcp.json')), false);
  assert.equal(readFileSync(join(dir, '.gitignore'), 'utf8').trim(), 'node_modules/');
  assert.equal(existsSync(join(dir, '.claude', 'team', 'manifest.json')), false);
});

test('verify는 수정·삭제를 탐지', () => {
  const { dir } = installFresh();
  writeFileSync(join(dir, '.claude', 'agents', 'qa-agent.md'), '변조\n');
  const modified = install(['verify', '--target', dir]);
  assert.equal(modified.json.ok, false);
  assert.match(modified.json.checks.find((c) => c.name === 'files').detail, /qa-agent\.md\(수정됨\)/);
});

test('잘못된 answers는 거부하고 매니페스트 없는 verify·remove는 실패', () => {
  const dir = project();
  const bad = join(temp('answers-'), 'a.json');
  writeFileSync(bad, JSON.stringify({ profile: 'medium', context7: true }));
  assert.equal(install(planArgs(dir, bad)).status, 2);
  writeFileSync(bad, JSON.stringify({ profile: 'lite' }));
  assert.equal(install(planArgs(dir, bad)).status, 2);
  assert.equal(install(['verify', '--target', dir]).status, 1);
  assert.equal(install(['remove', '--target', dir, '--yes']).status, 1);
  assert.equal(install(['plan', '--target', join(dir, 'nope'), '--answers', bad]).status, 2);
});

test('v0.1.0은 미지원 PDCA 입력을 적용 전에 거부', () => {
  for (const pdca of ['standalone', 'integrated', 'unknown', null, false]) {
    const dir = project({ 'keep.txt': 'user content' });
    const file = answersFile({ pdca });
    const result = install(planArgs(dir, file));
    assert.equal(result.status, 2);
    assert.match(result.stderr, /off만 지원/);
    assert.deepEqual(readdirSync(dir), ['keep.txt']);
  }
});

test('PDCA 생략 시 off로 계획·설치', () => {
  const { dir } = installFresh({}, { pdca: undefined });
  assert.match(readFileSync(join(dir, '.claude/team/profile.md'), 'utf8'), /PDCA 모드: off/);
});

test('엄격 모드 설치는 승인 기록을 만들지 않고 실제 점검은 미확인으로 유지', () => {
  const { dir } = installFresh({}, { guardMode: 'strict' });
  assert.match(readFileSync(join(dir, '.claude/team/profile.md'), 'utf8'), /보호 모드: 엄격/);
  assert.equal(existsSync(join(dir, '.claude/team/bin/team-approval.mjs')), true);
  assert.equal(existsSync(join(dir, '.claude-team-docs/.guard/grant.json')), false);
  const result = install(['verify', '--target', dir, '--live']);
  assert.equal(result.json.ok, true, JSON.stringify(result.json));
  const checks = Object.fromEntries(result.json.checks.map((c) => [c.name, c.status]));
  assert.equal(checks['guard canary'], 'pass');
  assert.equal(checks['strict approval'], 'unverified');
  assert.equal(checks['guard live'], 'unverified');
});

test('잘못된 보호 모드 입력은 설치 계획 전에 거부', () => {
  const dir = project();
  const file = answersFile({ guardMode: 'unknown' });
  assert.equal(install(planArgs(dir, file)).status, 2);
  assert.deepEqual(readdirSync(dir), []);
});

test('verify --live의 Claude 호출은 설치 대상 폴더에서 실행', () => {
  const { dir } = installFresh();
  const tempDir = temp('live-cwd-');
  const fake = join(tempDir, 'claude.mjs');
  const marker = join(tempDir, 'cwd.txt');
  writeFileSync(fake, [
    "import { writeFileSync } from 'node:fs';",
    "if (process.argv.includes('--version')) console.log('2.1.302');",
    "else { writeFileSync(process.env.CAPTURE_CWD, process.cwd()); console.log(JSON.stringify({ result: 'team-guard: refused' })); }",
  ].join('\n'));
  const result = install(['verify', '--target', dir, '--live'], { TEAM_CLAUDE_BIN: '"' + process.execPath + '" "' + fake + '"', CAPTURE_CWD: marker });
  assert.equal(result.json.ok, true, JSON.stringify(result.json));
  assert.equal(realpathSync.native(readFileSync(marker, 'utf8')), realpathSync.native(dir));
});
