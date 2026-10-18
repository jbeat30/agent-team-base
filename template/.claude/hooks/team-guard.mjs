#!/usr/bin/env node
// 권고 모드 가드: PreToolUse·PostToolUse hook, 역할별 쓰기 경로와 에이전트 호출 대상·순서 검사
// 차단은 exit 2와 stderr 메시지, 오류·파싱 실패도 차단(fail closed)
// 보안 경계가 아닌 실수 방지 장치: 메인 세션의 Bash·사용자·hook 설정 변경은 방어하지 않음
// 전제: 에이전트 호출 인계에 `runId: <id>`, 기획안 상태는 `- 상태: confirmed`, 변경 계획 6장 표의 담당은 역할 이름
import { existsSync, mkdirSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const DOCS = '.claude-team-docs';
const WRITERS = ['frontend-agent', 'backend-agent', 'api-agent', 'test-agent'];
const ANALYSTS = ['planner-agent', 'architecture-agent'];
const ROLES = ['pm-agent', 'planning-lead', 'dev-lead', ...ANALYSTS, ...WRITERS, 'qa-agent'];
const SUBAGENT_ROLES = ROLES.filter((r) => r !== 'pm-agent');
// 서브에이전트 정의는 Agent 호출 대상 제한을 강제하지 않으므로 이 표로 검사
const CALL_TARGETS = {
  'planning-lead': ['planner-agent', 'architecture-agent', 'qa-agent'],
  'dev-lead': WRITERS,
};
const LOCK_TTL_MS = 30 * 60 * 1000;
const CASE_SENSITIVE = process.platform === 'linux';

const norm = (value) => (CASE_SENSITIVE ? value : value.toLowerCase());
const deny = (message) => {
  process.stderr.write(`team-guard: ${message}\n`);
  process.exit(2);
};

function readInput() {
  try {
    return JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return deny('hook 입력을 해석할 수 없음');
  }
}

function projectRoot(input) {
  const base = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  return realpathSync(base);
}

// 프로젝트 내부의 일반 경로만 허용: 밖으로 나가는 경로·UNC·다른 드라이브·symlink·junction 거부
function toRelative(root, filePath) {
  if (typeof filePath !== 'string' || !filePath) return deny('파일 경로 없음');
  if (filePath.startsWith('\\\\') || filePath.startsWith('//')) return deny(`UNC 경로 미지원: ${filePath}`);
  const abs = resolve(root, filePath);
  const rel = relative(root, abs);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return deny(`프로젝트 밖 경로: ${filePath}`);
  let ancestor = abs;
  while (!existsSync(ancestor)) {
    const parent = dirname(ancestor);
    if (parent === ancestor) return deny(`경로 해석 실패: ${filePath}`);
    ancestor = parent;
  }
  const expected = join(root, relative(root, ancestor));
  if (norm(realpathSync.native(ancestor)) !== norm(expected)) return deny(`symlink·junction 경로 미지원: ${filePath}`);
  return rel.split(sep).join('/');
}

function readText(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

function splitRow(line) {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|').replace(/^`+|`+$/g, '').trim());
}

function runPaths(root, runId) {
  const dir = join(root, DOCS, 'runs', runId);
  return { dir, request: join(dir, 'request.md'), plan: join(dir, 'plan.md') };
}

function validRunId(runId) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(runId ?? '');
}

function planConfirmed(root, runId) {
  const text = readText(runPaths(root, runId).plan);
  if (text === null) return false;
  const match = text.match(/^- 상태:\s*([A-Za-z-]+)/m);
  return match?.[1] === 'confirmed';
}

// 기획안 6장 표에서 역할에 배정된 구체적 파일 경로 추출, glob은 제외
function assignedFiles(root, runId, role) {
  const text = readText(runPaths(root, runId).plan);
  if (text === null) return [];
  const start = text.search(/^## 6\./m);
  if (start < 0) return [];
  const files = [];
  for (const line of text.slice(start).split(/\r?\n/).slice(1)) {
    if (/^## /.test(line)) break;
    if (!line.trim().startsWith('|') || /^\|\s*-/.test(line.trim())) continue;
    const cells = splitRow(line);
    const file = (cells[1] ?? '').replace(/\\/g, '/').replace(/^\.\//, '');
    if (!file || file === '파일' || /[*?[\]]/.test(file) || file.startsWith('/') || file.split('/').includes('..')) continue;
    if (cells[4] === role) files.push(norm(file));
  }
  return files;
}

const lockPath = (root) => join(root, DOCS, '.guard', 'writer.lock.json');

function readLock(root) {
  const text = readText(lockPath(root));
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function acquireLock(root, entry) {
  mkdirSync(dirname(lockPath(root)), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      writeFileSync(lockPath(root), JSON.stringify(entry), { flag: 'wx' });
      return;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const current = readLock(root);
      const stale = !current || Date.now() - (current.startedAt ?? 0) > LOCK_TTL_MS;
      if (!stale) return deny(`다른 쓰기 에이전트(${current.subagentType})가 실행 중, 쓰기는 순차로 호출`);
      unlinkSync(lockPath(root));
    }
  }
  return deny('쓰기 잠금 획득 실패');
}

// 모든 호출자에게 거부하는 보호 경로
function isProtectedFor(role, rl) {
  if (rl === '.git' || rl.startsWith('.git/')) return true;
  if (rl.startsWith(`${DOCS}/.guard/`)) return true;
  if (new RegExp(`^${DOCS}/runs/[^/]+/checks(/|$)`).test(rl)) return true;
  if (ROLES.includes(role) || role === 'main') return rl === '.claude' || rl.startsWith('.claude/');
  // 이 팀 외의 사용자 에이전트는 팀 정책 파일만 보호
  return (
    rl.startsWith('.claude/hooks/') ||
    rl.startsWith('.claude/team/') ||
    /^\.claude\/settings(\.local)?\.json$/.test(rl) ||
    ROLES.some((r) => rl === `.claude/agents/${r}.md`)
  );
}

function reportOwner(rel) {
  const m = rel.match(new RegExp(`^${DOCS}/runs/([^/]+)/reports/([a-z-]+?)(?:-\\d{2})?\\.md$`));
  return m ? { runId: m[1], name: m[2] } : null;
}

function ownReportRunId(role, rel) {
  const m = rel.match(new RegExp(`^${DOCS}/runs/([^/]+)/(reports/(.+)|plan\\.md|request\\.md)$`));
  if (!m) return null;
  const [, runId, , reportFile] = m;
  const name = reportFile ?? m[2];
  if ([...ANALYSTS, ...WRITERS].includes(role) && new RegExp(`^${role}-\\d{2}\\.md$`).test(reportFile ?? '')) return runId;
  if (role === 'qa-agent' && /^qa-(plan|final)\.md$/.test(reportFile ?? '')) return runId;
  if (role === 'dev-lead' && reportFile === 'dev-lead.md') return runId;
  if (role === 'planning-lead' && name === 'plan.md') return runId;
  return null;
}

function decideWrite(root, input) {
  const role = input.agent_type || 'main';
  const filePath = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  const rel = toRelative(root, filePath);
  const rl = rel.toLowerCase();

  const isPm = role === 'main' || role === 'pm-agent';
  // 프로필 수정은 사용자 요청을 받은 PM에게만 허용
  const pmProfile = isPm && rl === '.claude/team/profile.md';
  if (!pmProfile && isProtectedFor(role, rl)) return deny(`보호 경로는 수정할 수 없음: ${rel}`);

  if (isPm) {
    if (new RegExp(`^${DOCS}/runs/[^/]+/reports/`).test(rl)) return deny('보고 파일은 담당 에이전트만 작성할 수 있음(PM의 재작성·저장 금지)');
    return;
  }

  if (!SUBAGENT_ROLES.includes(role)) return; // 이 팀 외의 에이전트

  const reportRun = ownReportRunId(role, rl);
  if (reportRun !== null) {
    if (!validRunId(reportRun) || !existsSync(runPaths(root, reportRun).request)) return deny(`실행 단위(request.md)가 없음: ${reportRun}`);
    return;
  }
  if (!WRITERS.includes(role)) return deny(`${role}은 자신의 보고 파일에만 쓸 수 있음: ${rel}`);

  const lock = readLock(root);
  if (!lock || lock.subagentType !== role) return deny(`${role}은 PM·dev-lead의 호출로 활성화된 경우에만 쓸 수 있음`);
  if (!planConfirmed(root, lock.runId)) return deny('기획안이 confirmed 상태가 아니라 소스·설정 쓰기를 시작할 수 없음');
  if (!assignedFiles(root, lock.runId, role).includes(norm(rl))) return deny(`기획안 변경 계획에서 ${role}에 배정되지 않은 파일: ${rel}`);
}

function decideAgent(root, input) {
  const caller = input.agent_type || 'main';
  const target = input.tool_input?.subagent_type;
  const prompt = input.tool_input?.prompt ?? '';
  if (!ROLES.includes(target)) return; // 이 팀 외의 에이전트 호출

  if (SUBAGENT_ROLES.includes(caller)) {
    const allowed = CALL_TARGETS[caller] ?? [];
    if (!allowed.includes(target)) return deny(`${caller}는 ${target}을 호출할 수 없음`);
    if (target === 'qa-agent' && /모드:\s*final/.test(prompt)) return deny('final 검증은 PM이 직접 호출');
  }

  const runId = prompt.match(/runId:\s*([A-Za-z0-9][A-Za-z0-9._-]*)/)?.[1];
  if (!runId) return deny('호출 인계에 runId가 필요');
  if (!existsSync(runPaths(root, runId).request)) return deny(`실행 단위(request.md)가 없음: ${runId}`);

  if (target === 'dev-lead' || WRITERS.includes(target)) {
    if (!planConfirmed(root, runId)) return deny('기획안이 confirmed 상태가 아니라 개발 호출을 시작할 수 없음');
  }
  if (WRITERS.includes(target)) {
    acquireLock(root, { runId, subagentType: target, toolUseId: input.tool_use_id, startedAt: Date.now() });
  }
}

function releaseLock(root, input) {
  const target = input.tool_input?.subagent_type;
  if (!WRITERS.includes(target)) return;
  const lock = readLock(root);
  if (lock && lock.toolUseId === input.tool_use_id) unlinkSync(lockPath(root));
}

try {
  const input = readInput();
  const root = projectRoot(input);
  const tool = input.tool_name;
  if (input.hook_event_name === 'PreToolUse') {
    if (tool === 'Agent' || tool === 'Task') decideAgent(root, input);
    else decideWrite(root, input);
  } else if (input.hook_event_name === 'PostToolUse' || input.hook_event_name === 'PostToolUseFailure') {
    if (tool === 'Agent' || tool === 'Task') releaseLock(root, input);
  }
  process.exit(0);
} catch (error) {
  deny(`가드 오류: ${error.message}`);
}
