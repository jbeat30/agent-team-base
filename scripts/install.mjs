#!/usr/bin/env node
// 설치 스크립트: detect(조사) · plan(계획) · apply(적용) · verify(검증) · remove(제거)
// LLM이 파일 복사·병합·해시를 직접 수행하지 않도록 결정적으로 동작하며 모든 결과를 JSON 한 객체로 출력
// 프로젝트(--target) 안의 파일만 변경하고 홈·전역 설정은 건드리지 않음
// 종료 코드: 0 성공, 1 검증 실패·진행 불가(결과 JSON 참고), 2 사용법·입력 오류
//
//   node install.mjs detect --target <dir>
//   node install.mjs plan   --target <dir> --answers <file> [--on-conflict skip|replace-with-backup]
//   node install.mjs apply  --target <dir> --answers <file> --plan-hash <hash> [--on-conflict ...]
//   node install.mjs verify --target <dir> [--live]
//   node install.mjs remove --target <dir> [--yes]
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, unlinkSync, writeFileSync, rmdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const templateRoot = join(repoRoot, 'template');
const TEMPLATE_VERSION = '0.3.1';
const SOURCE_REPO = 'https://github.com/jbeat30/claude-team-base';
const MIN_CLAUDE = '2.1.302';
const MIN_NODE = 18;
const MANIFEST_PATH = '.claude/team/manifest.json';
const SETTINGS_PATH = '.claude/settings.json';
const MCP_PATH = '.mcp.json';
const GITIGNORE_PATH = '.gitignore';
const DOCS_DIR = '.claude-team-docs';
const GITIGNORE_BEGIN = '# >>> claude-team-base';
const GITIGNORE_END = '# <<< claude-team-base';
// 등록하는 MCP 서버, 형식은 각 공식 문서의 Claude Code 설정을 따름(Figma는 http 전송, 첫 사용 때 브라우저 로그인 필요)
const DESIGN_TOOLS = ['playwright', 'chrome-devtools', 'shadcn', 'figma'];
const MCP_SERVERS = {
  context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] },
  playwright: { command: 'npx', args: ['@playwright/mcp@latest'] },
  'chrome-devtools': { command: 'npx', args: ['-y', 'chrome-devtools-mcp@latest'] },
  shadcn: { command: 'npx', args: ['shadcn@latest', 'mcp'] },
  figma: { type: 'http', url: 'https://mcp.figma.com/mcp' },
};
const ROLE_FILES = ['planning-lead', 'dev-lead', 'planner-agent', 'architecture-agent', 'frontend-agent', 'backend-agent', 'api-agent', 'test-agent', 'qa-agent'];
// v0.2.x까지 설치된 PM 정의: v0.3.0부터 PM은 .claude/skills/team 스킬, 갱신 때 사용자가 수정하지 않았으면 삭제
const RETIRED_FILES = ['.claude/agents/pm-agent.md'];
// 복사하지 않는 템플릿 파일: settings는 병합, 프로필은 조사 결과로 생성
const NOT_COPIED = new Set(['.claude/settings.fragment.json', '.claude/team/profile.template.md']);

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const posix = (p) => p.split(sep).join('/');
const fail = (message, code = 2) => {
  process.stderr.write(`install: ${message}\n`);
  process.exit(code);
};
const output = (object, code = 0) => {
  process.stdout.write(`${JSON.stringify(object, null, 2)}\n`);
  process.exit(code);
};

// ---------- 공통 유틸 ----------

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let i = 0; i < rest.length; i++) {
    if (!rest[i].startsWith('--')) fail(`unknown argument: ${rest[i]}`);
    const key = rest[i].slice(2);
    const next = rest[i + 1];
    if (next === undefined || next.startsWith('--')) options[key] = true;
    else {
      options[key] = next;
      i++;
    }
  }
  return { command, options };
}

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

// TEAM_CLAUDE_BIN은 테스트에서 claude 명령을 대체하기 위한 환경 변수
function runClaude(args, input, cwd) {
  const bin = process.env.TEAM_CLAUDE_BIN;
  return spawnSync(bin ?? 'claude', args, { cwd, input, encoding: 'utf8', shell: Boolean(bin) || process.platform === 'win32', timeout: 180000 });
}

function claudeStatus() {
  const result = runClaude(['--version']);
  const version = result.status === 0 ? result.stdout.match(/(\d+\.\d+\.\d+)/)?.[1] : null;
  if (!version) return { status: 'unknown', version: null, minimum: MIN_CLAUDE };
  return { status: compareVersions(version, MIN_CLAUDE) >= 0 ? 'ok' : 'below', version, minimum: MIN_CLAUDE };
}

function nodeStatus() {
  const major = Number(process.versions.node.split('.')[0]);
  return { status: major >= MIN_NODE ? 'ok' : 'below', version: process.versions.node, minimum: `${MIN_NODE}` };
}

function sourceInfo() {
  // 플러그인 캐시는 git 저장소가 아니므로 상위 저장소를 오인하지 않도록 .git 존재를 먼저 확인
  if (!existsSync(join(repoRoot, '.git'))) {
    return { repo: SOURCE_REPO, templateVersion: TEMPLATE_VERSION, tag: `v${TEMPLATE_VERSION}`, commit: null, channel: 'plugin' };
  }
  const git = (...args) => spawnSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' });
  const commit = git('rev-parse', 'HEAD');
  const tag = git('describe', '--tags', '--exact-match');
  return {
    repo: SOURCE_REPO,
    templateVersion: TEMPLATE_VERSION,
    tag: tag.status === 0 ? tag.stdout.trim() : null,
    commit: commit.status === 0 ? commit.stdout.trim() : null,
  };
}

function targetDir(options) {
  if (typeof options.target !== 'string') fail('--target <dir> required');
  const dir = resolve(options.target);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) fail(`target directory not found: ${dir}`);
  return dir;
}

function readJson(path) {
  try {
    return { value: JSON.parse(readFileSync(path, 'utf8')) };
  } catch (error) {
    return { error: error.message };
  }
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

function templateFiles() {
  return walk(templateRoot)
    .map((abs) => ({ path: posix(relative(templateRoot, abs)), abs }))
    .filter((f) => !NOT_COPIED.has(f.path))
    .sort((a, b) => a.path.localeCompare(b.path));
}

const escapeCell = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

// ---------- detect ----------

function detectStacks(dir) {
  const has = (name) => existsSync(join(dir, name));
  const stacks = [];
  const checks = [];
  const sideEffect = (body) => (/--fix|--write|\bprettier\b(?!.*--check)|\bformat\b(?!.*check)/.test(body) ? 'present (may auto-fix)' : 'none (assumed)');

  if (has('package.json')) {
    const pkg = readJson(join(dir, 'package.json')).value ?? {};
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const known = ['react', 'next', 'vue', 'nuxt', 'svelte', '@angular/core', 'express', '@nestjs/core', 'fastify', 'koa', 'typescript', 'vite', 'jest', 'vitest', 'eslint', 'prettier'];
    const pm = has('pnpm-lock.yaml') ? 'pnpm' : has('yarn.lock') ? 'yarn' : has('bun.lockb') ? 'bun' : 'npm';
    stacks.push({
      item: 'JavaScript/TypeScript (Node.js)',
      value: [pm, ...known.filter((k) => deps[k]).map((k) => `${k}@${deps[k]}`)].join(', '),
      evidence: ['package.json'],
    });
    const run = (name) => (pm === 'npm' && name === 'test' ? 'npm test' : `${pm} ${name === 'test' ? 'test' : `run ${name}`}`);
    for (const [purpose, names] of [['Test', ['test']], ['Lint', ['lint']], ['Type check', ['typecheck', 'type-check', 'tsc']]]) {
      const found = names.find((n) => pkg.scripts?.[n]);
      if (found) checks.push({ purpose, command: run(found), cwd: '.', sideEffect: sideEffect(pkg.scripts[found]), evidence: `package.json scripts.${found}` });
    }
  }
  if (has('pyproject.toml') || has('requirements.txt') || has('setup.py') || has('Pipfile')) {
    const text = ['pyproject.toml', 'requirements.txt', 'Pipfile', 'tox.ini', 'pytest.ini'].filter(has).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
    stacks.push({ item: 'Python', value: ['pytest', 'django', 'flask', 'fastapi', 'ruff', 'mypy', 'black'].filter((k) => new RegExp(k, 'i').test(text)).join(', '), evidence: ['pyproject.toml', 'requirements.txt'].filter(has) });
    if (/pytest/i.test(text) || has('pytest.ini')) checks.push({ purpose: 'Test', command: 'pytest', cwd: '.', sideEffect: 'none (assumed)', evidence: 'pytest config and dependencies' });
    if (/ruff/i.test(text)) checks.push({ purpose: 'Lint', command: 'ruff check', cwd: '.', sideEffect: 'none (assumed)', evidence: 'ruff config and dependencies' });
    if (/mypy/i.test(text)) checks.push({ purpose: 'Type check', command: 'mypy .', cwd: '.', sideEffect: 'none (assumed)', evidence: 'mypy config and dependencies' });
  }
  if (has('go.mod')) {
    stacks.push({ item: 'Go', value: readFileSync(join(dir, 'go.mod'), 'utf8').match(/^go\s+(\S+)/m)?.[1] ?? '', evidence: ['go.mod'] });
    checks.push({ purpose: 'Test', command: 'go test ./...', cwd: '.', sideEffect: 'none (assumed)', evidence: 'go.mod' });
    checks.push({ purpose: 'Static check', command: 'go vet ./...', cwd: '.', sideEffect: 'none (assumed)', evidence: 'go.mod' });
  }
  if (has('pom.xml')) {
    stacks.push({ item: 'Java (Maven)', value: '', evidence: ['pom.xml'] });
    checks.push({ purpose: 'Test', command: 'mvn test', cwd: '.', sideEffect: 'none (assumed)', evidence: 'pom.xml' });
  }
  if (has('build.gradle') || has('build.gradle.kts')) {
    stacks.push({ item: 'Java/Kotlin (Gradle)', value: '', evidence: ['build.gradle(.kts)'] });
    checks.push({ purpose: 'Test', command: has('gradlew') ? './gradlew test' : 'gradle test', cwd: '.', sideEffect: 'none (assumed)', evidence: 'build.gradle' });
  }
  if (has('Cargo.toml')) {
    stacks.push({ item: 'Rust', value: '', evidence: ['Cargo.toml'] });
    checks.push({ purpose: 'Test', command: 'cargo test', cwd: '.', sideEffect: 'none (assumed)', evidence: 'Cargo.toml' });
  }
  if (has('Gemfile')) stacks.push({ item: 'Ruby', value: '', evidence: ['Gemfile'] });
  if (has('composer.json')) stacks.push({ item: 'PHP', value: '', evidence: ['composer.json'] });
  if (readdirSync(dir).some((f) => /\.(sln|csproj)$/.test(f))) {
    stacks.push({ item: '.NET', value: '', evidence: ['*.sln|*.csproj'] });
    checks.push({ purpose: 'Test', command: 'dotnet test', cwd: '.', sideEffect: 'none (assumed)', evidence: '.sln/.csproj' });
  }
  return { stacks, checks };
}

function detect(dir) {
  const { stacks, checks } = detectStacks(dir);
  const conventionFiles = ['CLAUDE.md', 'AGENTS.md', 'CONTRIBUTING.md', '.editorconfig', '.prettierrc', '.eslintrc', '.eslintrc.json', 'eslint.config.js', 'eslint.config.mjs', 'ruff.toml', '.golangci.yml', 'tsconfig.json'].filter((f) => existsSync(join(dir, f)));
  const settings = existsSync(join(dir, SETTINGS_PATH)) ? readJson(join(dir, SETTINGS_PATH)) : null;
  const agentsDir = join(dir, '.claude', 'agents');
  const existingAgents = existsSync(agentsDir) ? readdirSync(agentsDir).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, '')) : [];
  return {
    target: dir,
    environment: { node: nodeStatus(), claude: claudeStatus(), gitRepository: existsSync(join(dir, '.git')) },
    stacks,
    suggestedChecks: checks,
    conventionFiles,
    existing: {
      claudeDir: existsSync(join(dir, '.claude')),
      agents: existingAgents,
      conflictingAgents: existingAgents.filter((a) => ROLE_FILES.includes(a)),
      settingsFile: settings !== null,
      settingsParseError: settings?.error ?? null,
      agentSetting: settings?.value?.agent ?? null,
      hasHooks: Boolean(settings?.value?.hooks),
      mcpFile: existsSync(join(dir, MCP_PATH)),
      context7Registered: Boolean(readJson(join(dir, MCP_PATH)).value?.mcpServers?.context7),
      registeredMcp: Object.keys(readJson(join(dir, MCP_PATH)).value?.mcpServers ?? {}),
      componentsJson: existsSync(join(dir, 'components.json')),
      gitignore: existsSync(join(dir, GITIGNORE_PATH)),
      installed: existsSync(join(dir, MANIFEST_PATH)),
    },
    note: 'detection results are estimates; reflect them in the answers file after user confirmation',
  };
}

// ---------- answers · profile ----------

function loadAnswers(options) {
  if (typeof options.answers !== 'string') fail('--answers <file> required');
  const parsed = readJson(resolve(options.answers));
  if (parsed.error) fail(`failed to parse the answers file: ${parsed.error}`);
  const a = parsed.value;
  if (a.profile !== undefined && !['lite', 'full'].includes(a.profile)) fail('answers.profile must be lite or full when given (default lite)');
  if (typeof a.context7 !== 'boolean') fail('answers.context7 must be true or false');
  if (a.executionMode !== undefined && !['nested', 'relay'].includes(a.executionMode)) fail('answers.executionMode must be nested or relay');
  if (a.guardMode !== undefined && !['advisory', 'strict'].includes(a.guardMode)) fail('answers.guardMode must be advisory or strict');
  if (a.designTools !== undefined && (!Array.isArray(a.designTools) || a.designTools.some((t) => !DESIGN_TOOLS.includes(t)))) fail(`answers.designTools must be an array of ${DESIGN_TOOLS.join(', ')}`);
  if (a.pdca !== undefined && a.pdca !== 'off') fail('only answers.pdca=off is supported; bkit PDCA integration is planned for a later version');
  return {
    profile: a.profile ?? 'lite',
    context7: a.context7,
    designTools: [...new Set(a.designTools ?? [])],
    gitignore: a.gitignore ?? true,
    pdca: 'off',
    // nested는 확인한 버전에서 리더가 하위 호출 도구를 받지 못해 기본을 relay로 둠, 모드를 나중에 full로 바꿔도 가드의 relay 보호가 켜져 있도록 lite도 relay로 기록
    executionMode: a.executionMode ?? 'relay',
    guardMode: a.guardMode ?? 'advisory',
    agentSetting: ['keep', 'replace'].includes(a.agentSetting) ? a.agentSetting : null,
    designSystem: a.designSystem ?? [],
    stack: a.stack ?? [],
    checks: a.checks ?? [],
    conventions: a.conventions ?? [],
    forbidden: a.forbidden ?? [],
  };
}

function renderProfile(answers, source) {
  const table = (head, rows) => [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.map(escapeCell).join(' | ')} |`)].join('\n');
  return `# Project profile

File generated from the install survey and user answers. Every agent reads it before work to reduce repeated questions.
No secrets. Mark items without evidence as \`unchecked\`. The user may edit it.

## Tech environment

${table(['Item', 'Value', 'Evidence path'], answers.stack.map((s) => [s.item, s.value || 'unchecked', [].concat(s.evidence ?? 'unchecked').join(', ')]))}

## Check commands

${table(['Purpose', 'Command', 'Working directory', 'Side effects (auto-fix, external access, state change)'], answers.checks.map((c) => [c.purpose, `\`${c.command}\``, c.cwd ?? '.', c.sideEffect ?? 'unchecked']))}

## Conventions

${table(['Item', 'Content', 'Evidence path'], answers.conventions.map((c) => [c.item, c.content ?? '', c.evidence ?? 'unchecked']))}

## Forbidden areas

${table(['Path', 'Reason'], answers.forbidden.map((f) => [f.path, f.reason ?? '']))}
${answers.designSystem.length ? `
## Design system

Authoritative for all UI work. Agents follow it without deviation and never introduce values or components outside it.

${table(['Item', 'Content', 'Location'], answers.designSystem.map((d) => [d.item, d.content ?? '', d.location ?? 'unchecked']))}
` : ''}
## Team settings

- Execution profile: ${answers.profile}
- Execution mode: ${answers.executionMode ?? 'n/a (lite)'}
- Context7 MCP: ${answers.context7 ? 'registered' : 'not registered'}
- Design tool MCP: ${answers.designTools.length ? answers.designTools.join(', ') : 'none'}
- Protection mode: ${answers.guardMode === 'strict' ? 'strict' : 'advisory'}
- PDCA mode: ${answers.pdca}
- Installed roles: ${ROLE_FILES.join(', ')} (all role files are always installed)
- Source repository, tag, commit: ${source.repo} · ${source.tag ?? 'no tag'} · ${source.commit ?? 'unchecked'}
`;
}

// ---------- plan ----------

function mergeSettings(existing, fragment, answers, legacyAgent) {
  const settings = structuredClone(existing ?? {});
  const result = { added: [], agent: { action: 'none', previous: null }, conflicts: [] };
  // v0.2.x 설치는 메인 세션을 PM으로 고정했으므로 갱신 때 설치기가 넣은 agent 설정만 해제
  if (settings.agent === 'pm-agent' && ['set', 'replaced'].includes(legacyAgent?.action)) {
    if (legacyAgent.action === 'replaced' && legacyAgent.previous) settings.agent = legacyAgent.previous;
    else delete settings.agent;
    result.agent = { action: 'released', previous: legacyAgent.previous ?? null };
  }
  for (const [event, groups] of Object.entries(fragment.hooks ?? {})) {
    settings.hooks ??= {};
    settings.hooks[event] ??= [];
    for (const group of groups) {
      for (const hook of group.hooks) {
        const present = settings.hooks[event].some((g) => (g.hooks ?? []).some((h) => h.command === hook.command));
        if (present) continue;
        let target = settings.hooks[event].find((g) => g.matcher === group.matcher);
        if (!target) {
          target = { matcher: group.matcher, hooks: [] };
          settings.hooks[event].push(target);
        }
        target.hooks.push(hook);
        result.added.push({ event, matcher: group.matcher, command: hook.command });
      }
    }
  }
  return { settings, ...result };
}

function mergeGitignoreBlock(text) {
  const block = `${GITIGNORE_BEGIN}\n${DOCS_DIR}/\n${GITIGNORE_END}`;
  if (text === null) return { text: `${block}\n`, changed: true };
  if (text.includes(GITIGNORE_BEGIN)) return { text, changed: false };
  return { text: `${text}${text.endsWith('\n') || text === '' ? '' : '\n'}${block}\n`, changed: true };
}

function buildPlan(dir, answers, options) {
  const source = sourceInfo();
  const environment = { node: nodeStatus(), claude: claudeStatus() };
  const blockers = [];
  if (environment.node.status === 'below') blockers.push(`Node below ${MIN_NODE}`);
  if (environment.claude.status === 'below') blockers.push(`Claude Code ${environment.claude.version} < minimum ${MIN_CLAUDE}; no automatic upgrade`);
  const manifestFile = join(dir, MANIFEST_PATH);
  const manifest = existsSync(manifestFile) ? readJson(manifestFile).value : null;
  const recorded = new Map((manifest?.files ?? []).map((f) => [f.path, f.sha256]));
  const onConflict = options['on-conflict'] ?? null;
  if (onConflict && !['skip', 'replace-with-backup'].includes(onConflict)) fail('--on-conflict must be skip or replace-with-backup');

  const operations = [];
  const conflicts = [];
  const desired = templateFiles().map((f) => ({ path: f.path, content: readFileSync(f.abs) }));
  desired.push({ path: '.claude/team/profile.md', content: Buffer.from(renderProfile(answers, source), 'utf8') });

  for (const file of desired) {
    const abs = join(dir, file.path);
    const hash = sha256(file.content);
    if (!existsSync(abs)) {
      operations.push({ path: file.path, action: 'create', sha256: hash, content: file.content });
      continue;
    }
    const current = sha256(readFileSync(abs));
    if (current === hash) operations.push({ path: file.path, action: 'unchanged', sha256: hash, content: file.content });
    else if (recorded.get(file.path) === current) operations.push({ path: file.path, action: 'update', sha256: hash, content: file.content });
    else {
      const reason = recorded.has(file.path) ? 'file modified by the user after install' : 'different file that already exists';
      conflicts.push({ item: file.path, reason });
      operations.push({ path: file.path, action: onConflict === 'replace-with-backup' ? 'replace-with-backup' : 'skip', sha256: hash, content: file.content, conflict: true });
    }
  }

  for (const path of RETIRED_FILES) {
    const abs = join(dir, path);
    if (!existsSync(abs)) continue;
    if (recorded.get(path) === sha256(readFileSync(abs))) operations.push({ path, action: 'delete', sha256: recorded.get(path) });
    else operations.push({ path, action: 'keep-retired', sha256: sha256(readFileSync(abs)) });
  }

  // settings 병합
  const settingsAbs = join(dir, SETTINGS_PATH);
  const fragment = readJson(join(templateRoot, '.claude', 'settings.fragment.json')).value;
  let settingsPlan = { action: 'none' };
  const existingSettings = existsSync(settingsAbs) ? readJson(settingsAbs) : { value: null };
  if (existingSettings.error) {
    blockers.push(`${SETTINGS_PATH} JSON cannot be parsed; fix it and run again: ${existingSettings.error}`);
    settingsPlan = { action: 'blocked', reason: 'unparseable' };
  } else {
    const merged = mergeSettings(existingSettings.value, fragment, answers, manifest?.settings?.agent);
    for (const c of merged.conflicts) conflicts.push(c);
    const changed = merged.added.length > 0 || merged.agent.action === 'released';
    settingsPlan = { action: merged.conflicts.length ? 'blocked' : changed ? (existingSettings.value ? 'merge' : 'create') : 'unchanged', agent: merged.agent, addedHooks: merged.added, content: merged.conflicts.length ? null : `${JSON.stringify(merged.settings, null, 2)}\n` };
  }

  // MCP 등록: Context7과 선택한 디자인 도구를 한 번에 병합, 서버별로 추가·동일·충돌 판정
  let mcpPlan = { action: 'none', servers: {} };
  const wanted = [...(answers.context7 ? ['context7'] : []), ...answers.designTools];
  if (wanted.length) {
    const mcpAbs = join(dir, MCP_PATH);
    const mcp = existsSync(mcpAbs) ? readJson(mcpAbs) : { value: {} };
    if (mcp.error) {
      conflicts.push({ item: MCP_PATH, reason: `JSON unparseable: ${mcp.error}` });
      mcpPlan = { action: 'skip', reason: 'unparseable', servers: {} };
    } else {
      const next = structuredClone(mcp.value);
      const servers = {};
      for (const name of wanted) {
        const existing = mcp.value.mcpServers?.[name];
        if (!existing) {
          next.mcpServers ??= {};
          next.mcpServers[name] = MCP_SERVERS[name];
          servers[name] = 'add';
        } else if (JSON.stringify(existing) === JSON.stringify(MCP_SERVERS[name])) servers[name] = 'already';
        else {
          conflicts.push({ item: `${MCP_PATH} ${name}`, reason: `a different ${name} setting already exists; left unchanged` });
          servers[name] = 'skip';
        }
      }
      const added = Object.values(servers).includes('add');
      const allAlready = Object.values(servers).every((v) => v === 'already');
      mcpPlan = { action: added ? 'add' : allAlready ? 'already' : 'skip', servers, content: added ? `${JSON.stringify(next, null, 2)}\n` : undefined };
    }
  }

  // .gitignore
  let gitignorePlan = { action: 'none' };
  if (answers.gitignore) {
    const gAbs = join(dir, GITIGNORE_PATH);
    const merged = mergeGitignoreBlock(existsSync(gAbs) ? readFileSync(gAbs, 'utf8') : null);
    gitignorePlan = merged.changed ? { action: existsSync(gAbs) ? 'append' : 'create', content: merged.text } : { action: 'already' };
  }

  // settings.agent 충돌은 hook 설치 여부를 가르므로 --on-conflict와 무관하게 answers.agentSetting으로만 해소
  const unresolved = conflicts.filter((c) => (c.item === 'settings.agent' ? true : !onConflict));
  const core = {
    version: TEMPLATE_VERSION,
    source,
    answers,
    onConflict,
    files: operations.map(({ path, action, sha256: s }) => ({ path, action, sha256: s })),
    settings: { action: settingsPlan.action, agent: settingsPlan.agent ?? null, addedHooks: settingsPlan.addedHooks ?? [], contentSha256: settingsPlan.content ? sha256(settingsPlan.content) : null },
    mcp: { action: mcpPlan.action, servers: mcpPlan.servers, contentSha256: mcpPlan.content ? sha256(mcpPlan.content) : null },
    gitignore: { action: gitignorePlan.action, contentSha256: gitignorePlan.content ? sha256(gitignorePlan.content) : null },
    conflicts,
    blockers,
  };
  return { core, hash: sha256(JSON.stringify(core)), operations, settingsPlan, mcpPlan, gitignorePlan, environment, unresolved, manifest, source };
}

function summarize(plan) {
  const count = (a) => plan.core.files.filter((f) => f.action === a).length;
  const lines = [
    `source: ${plan.source.tag ?? 'no tag'} (${plan.source.commit?.slice(0, 7) ?? 'commit unchecked'}) · profile ${plan.core.answers.profile} · PDCA ${plan.core.answers.pdca}`,
    `files: new ${count('create')} · update ${count('update')} · unchanged ${count('unchanged')} · replace (backup) ${count('replace-with-backup')} · skip ${count('skip')}`,
    `settings: ${plan.core.settings.action}${plan.core.settings.agent?.action && plan.core.settings.agent.action !== 'none' ? ` (agent ${plan.core.settings.agent.action})` : ''}, added hooks ${plan.core.settings.addedHooks.length}`,
    `MCP (.mcp.json): ${plan.core.mcp.action}${Object.keys(plan.core.mcp.servers ?? {}).length ? ` (${Object.entries(plan.core.mcp.servers).map(([k, v]) => `${k} ${v}`).join(', ')})` : ''} · .gitignore: ${plan.core.gitignore.action}`,
    plan.core.conflicts.length ? `conflicts ${plan.core.conflicts.length}: ${plan.core.conflicts.map((c) => `${c.item}(${c.reason})`).join('; ')}` : 'no conflicts',
    plan.core.blockers.length ? `blocked: ${plan.core.blockers.join('; ')}` : `environment: Node ${plan.environment.node.version}, Claude Code ${plan.environment.claude.version ?? 'unchecked'} (${plan.environment.claude.status})`,
    'rollback: the remove command removes only installed items (files you modified are kept); originals of replaced files are kept in the backup path',
  ];
  return lines;
}

// ---------- apply ----------

function writeFile(dir, rel, content) {
  const abs = join(dir, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

function backup(dir, backupRoot, rel) {
  const abs = join(dir, rel);
  if (!existsSync(abs)) return false;
  const dest = join(backupRoot, rel);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, readFileSync(abs));
  return true;
}

function apply(dir, options) {
  const answers = loadAnswers(options);
  const plan = buildPlan(dir, answers, options);
  if (typeof options['plan-hash'] !== 'string') fail('--plan-hash <hash> required; pass the hash from the plan result after user confirmation');
  if (options['plan-hash'] !== plan.hash) return output({ ok: false, reason: 'input or project state changed since plan; run plan again and confirm', expected: plan.hash }, 1);
  if (plan.core.blockers.length) return output({ ok: false, reason: 'blocked', blockers: plan.core.blockers }, 1);
  if (plan.unresolved.length) return output({ ok: false, reason: 'a conflict handling choice is required (--on-conflict skip|replace-with-backup)', conflicts: plan.unresolved }, 1);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupRel = `${DOCS_DIR}/backups/${stamp}`;
  const backupRoot = join(dir, backupRel);
  const backedUp = [];
  const doBackup = (rel) => {
    if (backup(dir, backupRoot, rel)) backedUp.push(rel);
  };

  const installed = [];
  const skipped = [];
  for (const op of plan.operations) {
    if (op.action === 'create' || op.action === 'update') {
      if (op.action === 'update') doBackup(op.path);
      writeFile(dir, op.path, op.content);
      installed.push({ path: op.path, sha256: op.sha256 });
    } else if (op.action === 'delete') {
      doBackup(op.path);
      unlinkSync(join(dir, op.path));
    } else if (op.action === 'keep-retired') skipped.push({ path: op.path, reason: 'retired file modified by the user; kept, delete manually if unused' });
    else if (op.action === 'unchanged') installed.push({ path: op.path, sha256: op.sha256 });
    else if (op.action === 'replace-with-backup') {
      doBackup(op.path);
      writeFile(dir, op.path, op.content);
      installed.push({ path: op.path, sha256: op.sha256 });
    } else skipped.push({ path: op.path, reason: 'skipped because of a conflict' });
  }

  const previous = plan.manifest;
  const hooks = [...(previous?.settings?.hooks ?? [])];
  let agentRecord = previous?.settings?.agent ?? { action: 'none', previous: null };
  const settingsPlan = plan.settingsPlan;
  if (settingsPlan.content) {
    doBackup(SETTINGS_PATH);
    writeFile(dir, SETTINGS_PATH, settingsPlan.content);
    for (const h of settingsPlan.addedHooks) if (!hooks.some((x) => x.event === h.event && x.command === h.command)) hooks.push(h);
    if (['set', 'replaced'].includes(settingsPlan.agent.action)) agentRecord = settingsPlan.agent;
    else if (settingsPlan.agent.action === 'released') agentRecord = { action: 'none', previous: null };
  }
  let mcpRecord = previous?.mcp ?? { context7: 'none' };
  if (plan.mcpPlan.action === 'add') {
    doBackup(MCP_PATH);
    writeFile(dir, MCP_PATH, plan.mcpPlan.content);
    for (const [name, action] of Object.entries(plan.mcpPlan.servers)) if (action === 'add') mcpRecord = { ...mcpRecord, [name]: 'added' };
  }
  let gitignoreRecord = previous?.gitignore ?? 'none';
  if (['append', 'create'].includes(plan.gitignorePlan.action)) {
    doBackup(GITIGNORE_PATH);
    writeFile(dir, GITIGNORE_PATH, plan.gitignorePlan.content);
    gitignoreRecord = 'added';
  }

  const manifest = {
    schema: 1,
    name: 'claude-team-base',
    templateVersion: TEMPLATE_VERSION,
    source: plan.source,
    installedAt: new Date().toISOString(),
    profile: answers.profile,
    files: installed,
    skipped,
    settings: { hooks, agent: agentRecord },
    mcp: mcpRecord,
    gitignore: gitignoreRecord,
    backups: backedUp.length ? backupRel : null,
  };
  writeFile(dir, MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  return output({ ok: true, installedFiles: installed.length, skipped, backups: manifest.backups, manifest: MANIFEST_PATH, next: 'check with the verify command' });
}

// ---------- verify ----------

function guardCanary(dir) {
  const script = join(dir, '.claude', 'hooks', 'team-guard.mjs');
  if (!existsSync(script)) return { status: 'fail', detail: 'team-guard.mjs not found' };
  const run = (input) => spawnSync(process.execPath, [script], { cwd: dir, env: { ...process.env, CLAUDE_PROJECT_DIR: dir }, input: JSON.stringify({ cwd: dir, permission_mode: 'default', hook_event_name: 'PreToolUse', ...input }), encoding: 'utf8' });
  const denied = run({ tool_name: 'Write', agent_type: 'pm-agent', tool_input: { file_path: '.git/team-canary' } });
  const allowed = run({ tool_name: 'Write', agent_type: 'pm-agent', tool_input: { file_path: '.claude-team-docs/runs/team-canary/request.md' } });
  const broken = spawnSync(process.execPath, [script], { cwd: dir, input: '{not json', encoding: 'utf8' });
  const ok = denied.status === 2 && allowed.status === 0 && broken.status === 2;
  return { status: ok ? 'pass' : 'fail', detail: ok ? 'protected path denied, PM run record path allowed, blocks on error (script run alone; check hook firing in Claude with --live)' : `denied ${denied.status}, allowed ${allowed.status}, error ${broken.status}` };
}

function liveCanary(dir) {
  const result = runClaude(['-p', '--permission-mode', 'acceptEdits', '--output-format', 'json', '--max-turns', '4'], 'Use the Write tool to create the file .git/team-canary.txt with the content x. Then report whether the write was created or refused, quoting any refusal message.', dir);
  if (result.status !== 0) return { status: 'unverified', detail: `claude run failed (exit ${result.status})` };
  let text = '';
  try {
    text = JSON.parse(result.stdout).result ?? '';
  } catch {
    return { status: 'unverified', detail: 'failed to parse output' };
  }
  const created = existsSync(join(dir, '.git', 'team-canary.txt'));
  if (created) {
    rmSync(join(dir, '.git', 'team-canary.txt'), { force: true });
    return { status: 'fail', detail: 'write to a protected path was allowed; guard not working' };
  }
  return /team-guard/.test(text) ? { status: 'pass', detail: 'hook firing and blocking confirmed in Claude Code' } : { status: 'unverified', detail: 'the write was not made, but no team-guard denial message was seen' };
}

function verify(dir, options) {
  const checks = [];
  const add = (name, status, detail) => checks.push({ name, status, detail });
  const manifestFile = join(dir, MANIFEST_PATH);
  if (!existsSync(manifestFile)) return output({ ok: false, checks: [{ name: 'manifest', status: 'fail', detail: 'install manifest not found' }] }, 1);
  const manifest = readJson(manifestFile).value;
  const bad = [];
  for (const f of manifest.files) {
    const abs = join(dir, f.path);
    if (!existsSync(abs)) bad.push(`${f.path}(missing)`);
    else if (sha256(readFileSync(abs)) !== f.sha256) bad.push(`${f.path}(modified)`);
  }
  add('files', bad.length ? 'fail' : 'pass', bad.length ? bad.join(', ') : `${manifest.files.length} file hashes match`);
  const settings = readJson(join(dir, SETTINGS_PATH));
  const missingHooks = (manifest.settings.hooks ?? []).filter((h) => !(settings.value?.hooks?.[h.event] ?? []).some((g) => (g.hooks ?? []).some((x) => x.command === h.command)));
  add('settings hooks', settings.error || missingHooks.length ? 'fail' : 'pass', settings.error ?? (missingHooks.length ? `missing ${missingHooks.length}` : 'hooks registered'));
  const skillOk = existsSync(join(dir, '.claude', 'skills', 'team', 'SKILL.md'));
  add('team skill', skillOk ? 'pass' : 'fail', skillOk ? '/team skill present' : 'missing .claude/skills/team/SKILL.md');
  if (settings.value?.agent === 'pm-agent') add('settings agent', 'unverified', 'legacy agent=pm-agent pins every request to the PM; run the update to release it');
  const roles = ROLE_FILES.filter((r) => !existsSync(join(dir, '.claude', 'agents', `${r}.md`)));
  add('role files', roles.length ? 'fail' : 'pass', roles.length ? `missing ${roles.join(', ')}` : 'all 9 role files present');
  const claude = claudeStatus();
  add('claude version', claude.status === 'ok' ? 'pass' : claude.status === 'below' ? 'fail' : 'unverified', `${claude.version ?? 'unavailable'} (minimum ${MIN_CLAUDE})`);
  const canary = guardCanary(dir);
  add('guard canary', canary.status, canary.detail);
  const strict = existsSync(join(dir, '.claude/team/profile.md')) && /^- Protection mode:\s*strict\s*$/m.test(readFileSync(join(dir, '.claude/team/profile.md'), 'utf8'));
  if (strict) add('strict approval', 'unverified', 'direct approval scope, registration, and default interactive runs need a separate check; never treat as automatically confirmed');
  if (options.live && strict) {
    add('guard live', 'unverified', 'strict mode needs direct approval and guard firing checked in a default interactive session; non-interactive call skipped');
  } else if (options.live) {
    const live = liveCanary(dir);
    add('guard live', live.status, live.detail);
  } else add('guard live', 'unverified', 'hook firing in Claude Code is unchecked until confirmed with --live; if unchecked, treat as no protection');
  for (const name of Object.keys(MCP_SERVERS)) {
    if (manifest.mcp?.[name] === 'added') add(name, 'unverified', `.mcp.json registration confirmed; the actual connection needs approval after restarting Claude Code${name === 'figma' ? ' and a browser sign-in to Figma' : ''}${name === 'chrome-devtools' || name === 'playwright' ? '; the tool can see browser content, so avoid personal tabs and sensitive data' : ''}`);
  }
  const ok = !checks.some((c) => c.status === 'fail');
  return output({ ok, checks }, ok ? 0 : 1);
}

// ---------- remove ----------

function pruneEmptyDirs(dir, rel) {
  let current = join(dir, dirname(rel));
  while (current.startsWith(dir) && current !== dir) {
    if (!existsSync(current) || readdirSync(current).length) break;
    rmdirSync(current);
    current = dirname(current);
  }
}

function remove(dir, options) {
  const manifestFile = join(dir, MANIFEST_PATH);
  if (!existsSync(manifestFile)) fail('install manifest not found', 1);
  const manifest = readJson(manifestFile).value;
  const apply = options.yes === true;
  const removed = [];
  const kept = [];
  for (const f of manifest.files) {
    const abs = join(dir, f.path);
    if (!existsSync(abs)) continue;
    if (sha256(readFileSync(abs)) === f.sha256) {
      removed.push(f.path);
      if (apply) {
        unlinkSync(abs);
        pruneEmptyDirs(dir, f.path);
      }
    } else kept.push({ path: f.path, reason: 'modified by the user after install; not deleted' });
  }

  const actions = [];
  const settingsAbs = join(dir, SETTINGS_PATH);
  if (existsSync(settingsAbs)) {
    const parsed = readJson(settingsAbs);
    if (parsed.error) kept.push({ path: SETTINGS_PATH, reason: 'JSON unparseable; clean up manually' });
    else {
      const settings = parsed.value;
      for (const h of manifest.settings?.hooks ?? []) {
        const groups = settings.hooks?.[h.event];
        if (!groups) continue;
        for (const g of groups) g.hooks = (g.hooks ?? []).filter((x) => x.command !== h.command);
        settings.hooks[h.event] = groups.filter((g) => g.hooks.length);
        if (!settings.hooks[h.event].length) delete settings.hooks[h.event];
        actions.push(`removed settings hook: ${h.event}`);
      }
      if (settings.hooks && !Object.keys(settings.hooks).length) delete settings.hooks;
      const agent = manifest.settings?.agent;
      if (agent?.action === 'set' && settings.agent === 'pm-agent') {
        delete settings.agent;
        actions.push('removed settings agent');
      } else if (agent?.action === 'replaced' && settings.agent === 'pm-agent') {
        settings.agent = agent.previous;
        actions.push(`restored settings agent: ${agent.previous}`);
      }
      if (apply) {
        if (Object.keys(settings).length) writeFileSync(settingsAbs, `${JSON.stringify(settings, null, 2)}\n`);
        else unlinkSync(settingsAbs);
      }
    }
  }
  const mcpAbs = join(dir, MCP_PATH);
  const addedMcp = Object.keys(MCP_SERVERS).filter((name) => manifest.mcp?.[name] === 'added');
  if (addedMcp.length && existsSync(mcpAbs)) {
    const parsed = readJson(mcpAbs);
    if (!parsed.error) {
      let changed = false;
      for (const name of addedMcp) {
        if (!parsed.value.mcpServers?.[name]) continue;
        delete parsed.value.mcpServers[name];
        actions.push(`removed .mcp.json ${name}`);
        changed = true;
      }
      if (parsed.value.mcpServers && !Object.keys(parsed.value.mcpServers).length) delete parsed.value.mcpServers;
      if (apply && changed) {
        if (Object.keys(parsed.value).length) writeFileSync(mcpAbs, `${JSON.stringify(parsed.value, null, 2)}\n`);
        else unlinkSync(mcpAbs);
      }
    }
  }
  const gAbs = join(dir, GITIGNORE_PATH);
  if (manifest.gitignore === 'added' && existsSync(gAbs)) {
    const text = readFileSync(gAbs, 'utf8');
    const pattern = new RegExp(`\\n?${GITIGNORE_BEGIN}[\\s\\S]*?${GITIGNORE_END}\\n?`);
    if (pattern.test(text)) {
      const next = text.replace(pattern, '\n').replace(/^\n+/, '');
      actions.push('removed .gitignore block');
      if (apply) {
        if (next.trim()) writeFileSync(gAbs, next);
        else unlinkSync(gAbs);
      }
    }
  }
  if (apply) {
    unlinkSync(manifestFile);
    pruneEmptyDirs(dir, MANIFEST_PATH);
  }
  return output({ ok: true, dryRun: !apply, removed, kept, actions, backups: manifest.backups, note: apply ? 'task records (.claude-team-docs) and backups are not deleted' : 'pass --yes to actually remove' });
}

// ---------- config ----------

const PROFILE_PATH = '.claude/team/profile.md';
// 설정 스킬이 보여 주는 MCP 목록: 선택 여부와 용도·주의 사항
const MCP_INFO = {
  context7: { kind: 'docs', used_by: 'PM and analysts', summary: 'Look up library documentation for the installed versions', note: 'Runs an external package through npx' },
  playwright: { kind: 'design', used_by: 'frontend-agent, qa-agent', summary: 'Open the running app in a browser and check it', note: 'Can see the content of the browser it opens; runs an external package through npx; a browser install may be needed' },
  'chrome-devtools': { kind: 'design', used_by: 'frontend-agent, qa-agent', summary: 'Inspect the screen, console, network and performance in Chrome', note: 'Can see the content of the browser it opens; runs an external package through npx' },
  shadcn: { kind: 'design', used_by: 'frontend-agent, qa-agent', summary: 'Reuse vetted shadcn/ui components', note: 'Needs components.json in the project; runs an external package through npx' },
  figma: { kind: 'design', used_by: 'frontend-agent, qa-agent', summary: 'Read Figma designs', note: 'Browser login is needed on first use' },
};

const profileLine = (text, label) => text.match(new RegExp(`^- ${label}:[ \\t]*(.*)$`, 'm'))?.[1]?.trim() ?? null;
const setProfileLine = (text, label, value) => text.replace(new RegExp(`^- ${label}:.*$`, 'm'), () => `- ${label}: ${value}`);

function config(dir, options) {
  const manifestFile = join(dir, MANIFEST_PATH);
  if (!existsSync(manifestFile)) fail('the team is not installed in this project; run the setup skill first');
  const manifest = readJson(manifestFile).value;
  const profileAbs = join(dir, PROFILE_PATH);
  if (!existsSync(profileAbs)) fail(`${PROFILE_PATH} is missing; run the update to restore it`);
  let profile = readFileSync(profileAbs, 'utf8');
  for (const label of ['Execution profile', 'Execution mode', 'Context7 MCP', 'Design tool MCP', 'Protection mode']) {
    if (profileLine(profile, label) === null) fail(`${PROFILE_PATH} has no "${label}" line; run the update to restore it`);
  }
  const mcpAbs = join(dir, MCP_PATH);
  const mcpFile = existsSync(mcpAbs) ? readJson(mcpAbs) : { value: {} };
  if (mcpFile.error) fail(`${MCP_PATH} cannot be parsed; fix it first: ${mcpFile.error}`);
  const servers = mcpFile.value.mcpServers ?? {};

  const setMode = options['set-mode'];
  if (setMode !== undefined && !['lite', 'full'].includes(setMode)) fail('--set-mode must be lite or full');
  const addMcp = options['add-mcp'] === undefined ? [] : [...new Set(String(options['add-mcp']).split(',').map((s) => s.trim()).filter(Boolean))];
  const unknown = addMcp.filter((n) => !MCP_SERVERS[n]);
  if (options['add-mcp'] === true || unknown.length) fail(`--add-mcp needs names from: ${Object.keys(MCP_SERVERS).join(', ')}${unknown.length ? ` (unknown: ${unknown.join(', ')})` : ''}`);

  const listMcp = () => Object.keys(MCP_SERVERS).map((name) => {
    const existing = servers[name];
    return { name, ...MCP_INFO[name], registered: Boolean(existing), differs: Boolean(existing) && JSON.stringify(existing) !== JSON.stringify(MCP_SERVERS[name]) };
  });
  const current = () => ({ mode: profileLine(profile, 'Execution profile'), executionMode: profileLine(profile, 'Execution mode'), protection: profileLine(profile, 'Protection mode') });

  if (setMode === undefined && !addMcp.length) {
    return output({ ok: true, ...current(), templateVersion: manifest.templateVersion, mcp: listMcp(), how: 'config --target <dir> --set-mode lite|full and/or --add-mcp <name[,name]>; add --yes to apply (default is a preview)' });
  }

  const changes = [];
  const conflicts = [];
  let nextServers = structuredClone(servers);
  let mcpChanged = false;
  const nextMcpRecord = { ...(manifest.mcp ?? { context7: 'none' }) };

  if (setMode !== undefined) {
    const before = profileLine(profile, 'Execution profile');
    if (before === setMode) changes.push(`mode: already ${setMode}`);
    else {
      profile = setProfileLine(profile, 'Execution profile', setMode);
      changes.push(`mode: ${before} -> ${setMode}`);
    }
    // 가드의 relay 보호가 모드와 무관하게 켜지도록 실행 모드를 항상 relay로 유지
    if (!/^relay\b/.test(profileLine(profile, 'Execution mode'))) profile = setProfileLine(profile, 'Execution mode', 'relay');
  }

  for (const name of addMcp) {
    const existing = servers[name];
    if (existing && JSON.stringify(existing) !== JSON.stringify(MCP_SERVERS[name])) {
      conflicts.push({ item: `${MCP_PATH} ${name}`, reason: `a different ${name} setting already exists; left unchanged` });
      continue;
    }
    if (!existing) {
      nextServers[name] = MCP_SERVERS[name];
      mcpChanged = true;
      nextMcpRecord[name] = 'added';
      changes.push(`mcp: add ${name} to ${MCP_PATH}`);
    } else changes.push(`mcp: ${name} already registered`);
    if (name === 'context7') profile = setProfileLine(profile, 'Context7 MCP', 'registered');
    else {
      const tools = (profileLine(profile, 'Design tool MCP') ?? 'none').split(',').map((s) => s.trim()).filter((s) => s && s !== 'none');
      if (!tools.includes(name)) profile = setProfileLine(profile, 'Design tool MCP', [...tools, name].join(', '));
    }
  }

  const apply = options.yes === true;
  if (!apply) return output({ ok: conflicts.length === 0, dryRun: true, changes, conflicts, note: 'preview only; add --yes to apply after the user confirms' }, conflicts.length ? 1 : 0);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupRel = `${DOCS_DIR}/backups/${stamp}`;
  const backupRoot = join(dir, backupRel);
  const backedUp = [];
  const doBackup = (rel) => {
    if (backup(dir, backupRoot, rel)) backedUp.push(rel);
  };
  doBackup(PROFILE_PATH);
  writeFile(dir, PROFILE_PATH, profile);
  if (mcpChanged) {
    doBackup(MCP_PATH);
    writeFile(dir, MCP_PATH, `${JSON.stringify({ ...mcpFile.value, mcpServers: nextServers }, null, 2)}\n`);
  }
  // 프로필이 매니페스트 해시와 어긋나 verify가 수정으로 보고하지 않도록 함께 갱신
  const entry = manifest.files.find((f) => f.path === PROFILE_PATH);
  if (entry) entry.sha256 = sha256(Buffer.from(profile, 'utf8'));
  if (setMode !== undefined) manifest.profile = setMode;
  manifest.mcp = nextMcpRecord;
  writeFile(dir, MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  return output({ ok: true, dryRun: false, changes, conflicts, backups: backedUp.length ? backupRel : null, note: mcpChanged ? 'start a new Claude Code session so the new MCP server is loaded; Claude asks to approve project MCP servers on first use' : undefined });
}

// ---------- 진입 ----------

const { command, options } = parseArgs(process.argv.slice(2));
if (!command) fail('usage: detect | plan | apply | verify | remove | config --target <dir> ...');
const dir = targetDir(options);
if (command === 'detect') output(detect(dir));
else if (command === 'plan') {
  const plan = buildPlan(dir, loadAnswers(options), options);
  output({ ok: plan.core.blockers.length === 0 && plan.unresolved.length === 0, hash: plan.hash, summary: summarize(plan), conflicts: plan.core.conflicts, blockers: plan.core.blockers, files: plan.core.files, settings: plan.core.settings, mcp: plan.core.mcp, gitignore: plan.core.gitignore });
} else if (command === 'apply') apply(dir, options);
else if (command === 'verify') verify(dir, options);
else if (command === 'remove') remove(dir, options);
else if (command === 'config') config(dir, options);
else fail(`unknown command: ${command}`);
