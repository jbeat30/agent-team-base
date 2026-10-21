// 어려운 과제 1회 실행기: 격리된 환경에서 직접 처리·Lite·Full을 같은 조건으로 실행하고 코드로 채점
// 사용법: REPO=<저장소 경로> BUDGET=2 node run.mjs <direct|lite|full> <taskId> <rep> <출력 폴더>
// 환경 변수: BUDGET(호출당 달러 상한), MODEL(기본 sonnet), CLAUDE_BIN(claude 실행 파일), PERM(기본 acceptEdits)
// 격리: 사용자 플러그인·MCP·슬래시 명령·전역 설정을 끄고 프로젝트 설정만 사용(없으면 호출당 약 14만 토큰이 더해짐)
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUTOMATION_NOTE, tasks } from './tasks.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const [condition, taskId, rep = '1', outDir] = process.argv.slice(2);
const repo = process.env.REPO;
const BUDGET = process.env.BUDGET ?? '2';
const MODEL = process.env.MODEL ?? 'sonnet';
const CLAUDE = process.env.CLAUDE_BIN ?? 'claude';
const PERMISSION = process.env.PERM ?? 'acceptEdits';
if (!['direct', 'lite', 'full'].includes(condition) || !tasks[taskId] || !outDir) throw new Error('usage: run.mjs <direct|lite|full> <taskId> <rep> <outDir>');
if (condition !== 'direct' && !repo) throw new Error('REPO is required for team conditions');

const task = tasks[taskId];
const work = realpathSync.native(mkdtempSync(join(tmpdir(), `evalhard-${condition}-${taskId}-r${rep}-`)));
cpSync(join(here, 'fixture'), work, { recursive: true });
task.setup?.(work);
const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: work, encoding: 'utf8', ...opts });
sh('git', ['init', '-q']);
sh('git', ['add', '-A']);
sh('git', ['-c', 'user.name=e', '-c', 'user.email=e@e', 'commit', '-qm', 'base']);

if (condition !== 'direct') {
  const answersFile = join(work, '..', `answers-${condition}-${taskId}-r${rep}.json`);
  writeFileSync(answersFile, JSON.stringify({
    profile: condition, executionMode: 'relay', context7: false, designTools: [], gitignore: true, pdca: 'off', guardMode: 'advisory',
    stack: [{ item: 'Node.js', value: 'node:test, ES modules', evidence: 'package.json' }],
    checks: [{ purpose: 'Test', command: 'npm test', cwd: '.', sideEffect: 'none' }],
    conventions: [], forbidden: [{ path: 'dist/', reason: 'generated file' }, { path: 'config/', reason: 'production config' }],
  }));
  const install = (args) => spawnSync(process.execPath, [join(repo, 'scripts', 'install.mjs'), ...args], { encoding: 'utf8' });
  const plan = JSON.parse(install(['plan', '--target', work, '--answers', answersFile]).stdout);
  const applied = install(['apply', '--target', work, '--answers', answersFile, '--plan-hash', plan.hash]);
  if (applied.status !== 0) throw new Error(`install failed: ${applied.stderr}${applied.stdout}`);
  sh('git', ['add', '-A']);
  sh('git', ['-c', 'user.name=e', '-c', 'user.email=e@e', 'commit', '-qm', 'team']);
}

const version = spawnSync(CLAUDE, ['--version'], { encoding: 'utf8' }).stdout?.trim();
const repoCommit = repo ? spawnSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout?.trim() : null;
const started = Date.now();
const run = sh(CLAUDE, [
  '-p', task.prompt + AUTOMATION_NOTE, '--output-format', 'stream-json', '--verbose', '--model', MODEL,
  '--permission-mode', PERMISSION, '--max-budget-usd', BUDGET,
  '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--disable-slash-commands', '--setting-sources', 'project',
  '--allowedTools', 'Bash(npm test)', 'Bash(node .claude/team/bin/*)', 'Bash(git diff:*)', 'Bash(git status:*)',
], { maxBuffer: 256 * 1024 * 1024, timeout: 40 * 60 * 1000 });
const wallMs = Date.now() - started;

const events = (run.stdout ?? '').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const calls = [];
for (const e of events) {
  if (e.type !== 'assistant') continue;
  for (const c of e.message?.content ?? []) {
    if (c.type === 'tool_use') calls.push({ name: c.name, nested: Boolean(e.parent_tool_use_id), agent: c.input?.subagent_type ?? null });
  }
}
// 백그라운드 서브에이전트가 있으면 result 이벤트가 여러 번 나오므로 마지막 것이 최종 결과(앞의 것은 중간 보고, 비용도 부분 값)
const results = events.filter((e) => e.type === 'result');
const result = results.at(-1) ?? {};
const usage = result.usage ?? {};
const finalText = result.result ?? '';

// 사용 한도에 걸리면 모델이 호출되지 않은 실행이므로 결과로 기록하지 않고 종료 코드 3으로 배치를 멈추게 함
if (/hit your (session |usage |weekly )?limit/i.test(finalText) && !(result.total_cost_usd > 0)) {
  console.error(`usage limit reached: ${finalText}`);
  process.exit(3);
}

mkdirSync(outDir, { recursive: true });
const stem = `${condition}-${taskId}-r${rep}`;
const textFile = join(outDir, `${stem}.final.txt`);
writeFileSync(textFile, finalText);
const scored = spawnSync(process.execPath, [join(here, 'score.mjs'), taskId, work, textFile], { encoding: 'utf8' });
let score = null;
try {
  score = JSON.parse(scored.stdout.trim().split('\n').pop());
} catch {
  score = { error: (scored.stderr || scored.stdout).slice(0, 500) };
}

const delegations = calls.filter((c) => c.name === 'Agent' || c.name === 'Task').map((c) => c.agent);
const summary = {
  condition, taskId, rep: Number(rep), size: task.size, expectedGrade: task.grade, model: MODEL, claudeVersion: version, repoCommit,
  exit: run.status, subtype: result.subtype ?? null, isError: result.is_error ?? null, budgetStopped: result.subtype === 'error_max_budget_usd',
  costUsd: result.total_cost_usd ?? null, turns: result.num_turns ?? null, wallMs,
  tokens: { input: usage.input_tokens ?? 0, cacheCreation: usage.cache_creation_input_tokens ?? 0, cacheRead: usage.cache_read_input_tokens ?? 0, output: usage.output_tokens ?? 0 },
  resultEvents: results.length, delegations, delegationCount: delegations.length,
  usedPlanFiles: calls.some((c) => c.name === 'Write') && events.some((e) => JSON.stringify(e).includes('.claude-team-docs/runs/')),
  score, workdir: work, stderr: (run.stderr ?? '').slice(0, 1000),
};
writeFileSync(join(outDir, `${stem}.json`), JSON.stringify(summary, null, 2));
writeFileSync(join(outDir, `${stem}.diff`), sh('git', ['diff', 'HEAD']).stdout ?? '');
writeFileSync(join(outDir, `${stem}.events.jsonl`), run.stdout ?? '');
console.log(JSON.stringify({ ...summary, workdir: undefined, stderr: undefined }));
