// template 정적 검사: 역할 정의 frontmatter·도구 제한·참조·문체
// 문구 포함 여부만 확인하며 권한 차단·위임 정확도의 검증이 아님
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { PM_RULES } from './pm-rules.mjs';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'template');
const agentsDir = join(root, '.claude', 'agents');
const teamDir = join(root, '.claude', 'team');

// 역할별 허용 도구 상한, pm-agent는 Agent 호출 대상 검사를 별도로 수행
const context7 = ['mcp__context7__resolve-library-id', 'mcp__context7__query-docs'];
const toolCeiling = {
  'planner-agent': ['Read', 'Glob', 'Grep', 'Write', ...context7],
  'architecture-agent': ['Read', 'Glob', 'Grep', 'Write', ...context7],
  'frontend-agent': ['Read', 'Glob', 'Grep', 'Edit', 'Write', ...context7, 'mcp__playwright__*', 'mcp__chrome-devtools__*', 'mcp__shadcn__*', 'mcp__figma__*'],
  'backend-agent': ['Read', 'Glob', 'Grep', 'Edit', 'Write', ...context7],
  'api-agent': ['Read', 'Glob', 'Grep', 'Edit', 'Write', ...context7],
  'test-agent': ['Read', 'Glob', 'Grep', 'Edit', 'Write', ...context7],
  'qa-agent': ['Read', 'Glob', 'Grep', 'Write', ...context7, 'mcp__playwright__*', 'mcp__chrome-devtools__*', 'mcp__figma__*'],
  'planning-lead': ['Read', 'Glob', 'Grep', 'Write'],
  'dev-lead': ['Read', 'Glob', 'Grep', 'Write'],
};
// 리더만 Agent 도구를 가지며 호출 대상은 소속 역할로 한정
const leaderTargets = {
  'planning-lead': ['planner-agent', 'architecture-agent', 'qa-agent'],
  'dev-lead': ['frontend-agent', 'backend-agent', 'api-agent', 'test-agent'],
};
const reportFields = ['status', 'summary', 'changedFiles', 'evidence', 'checks', 'unverified', 'blockers'];
const bannedPhrases = ['입니다', '하고 있습니다', '하는 로직입니다'];
// 설치 시 생성되는 파일은 존재 검사에서 제외
const generatedRefs = new Set(['profile.md']);

const errors = [];
const fail = (file, message) => errors.push(`${file}: ${message}`);

function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx > 0) fields[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return { fields, body: text.slice(match[0].length) };
}

// 쉼표 분리 시 Agent(a, b) 괄호 내부 쉼표 보존
function splitTools(value) {
  const tools = [];
  let depth = 0;
  let current = '';
  for (const ch of value) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      tools.push(current.trim());
      current = '';
    } else current += ch;
  }
  if (current.trim()) tools.push(current.trim());
  return tools;
}

const agentFiles = existsSync(agentsDir) ? readdirSync(agentsDir).filter((f) => f.endsWith('.md')) : [];
const agentNames = new Set(agentFiles.map((f) => f.replace(/\.md$/, '')));
const expectedRoles = ['pm-agent', ...Object.keys(toolCeiling)];

for (const role of expectedRoles) {
  if (!agentNames.has(role)) fail(`agents/${role}.md`, '역할 정의 파일 없음');
}

for (const file of agentFiles) {
  const name = file.replace(/\.md$/, '');
  const text = readFileSync(join(agentsDir, file), 'utf8');
  const parsed = parseFrontmatter(text);
  if (!parsed) {
    fail(file, 'frontmatter 없음');
    continue;
  }
  const { fields, body } = parsed;

  if (fields.name !== name) fail(file, `name(${fields.name})과 파일명 불일치`);
  if (!fields.description) fail(file, 'description 없음');
  else if (/[가-힣]/.test(fields.description)) fail(file, 'description은 영어로 작성');
  if (!fields.tools) fail(file, 'tools 명시 필요');
  if (!fields.model) fail(file, 'model 명시 필요');

  const tools = fields.tools ? splitTools(fields.tools) : [];

  if (name === 'pm-agent') {
    const agentTool = tools.find((t) => t.startsWith('Agent('));
    if (!agentTool) fail(file, 'Agent 호출 대상 제한(Agent(...)) 필요');
    else {
      for (const target of agentTool.slice(6, -1).split(',').map((s) => s.trim())) {
        if (!agentNames.has(target)) fail(file, `Agent 대상 ${target}의 정의 파일 없음`);
        if (target === 'pm-agent') fail(file, 'pm-agent는 자신을 호출 불가');
      }
    }
    for (const needle of ['# Relay mode', '# Requirement preservation check', 'team-check.mjs trace']) {
      if (!body.includes(needle)) fail(file, `${needle} 없음`);
    }
    continue;
  }

  const ceiling = toolCeiling[name];
  if (!ceiling) {
    fail(file, '정의되지 않은 역할, 도구 상한 등록 필요');
    continue;
  }
  const allowedTargets = leaderTargets[name];
  for (const tool of tools) {
    if (tool.startsWith('Agent(')) {
      if (!allowedTargets) fail(file, 'Agent 도구는 리더만 사용');
      else {
        const targets = tool.slice(6, -1).split(',').map((s) => s.trim());
        for (const t of targets) if (!allowedTargets.includes(t)) fail(file, `Agent 대상 ${t}은 소속 역할이 아님`);
        for (const t of allowedTargets) if (!targets.includes(t)) fail(file, `Agent 대상 ${t} 누락`);
      }
    } else if (!ceiling.includes(tool)) fail(file, `허용되지 않은 도구 ${tool}`);
  }
  if (allowedTargets && !tools.some((t) => t.startsWith('Agent('))) fail(file, '리더는 Agent(...) 필요');
  if (allowedTargets) {
    if (!body.includes('# Relay mode')) fail(file, 'relay 모드 절차 없음');
    if (!/^status: .*needs-dispatch/m.test(body)) fail(file, '보고 형식에 needs-dispatch 필요');
  }
  for (const heading of ['## Common rules', '## Report format']) {
    if (!body.includes(heading)) fail(file, `${heading} 구간 없음`);
  }
  for (const field of reportFields) {
    if (!new RegExp(`^${field}:`, 'm').test(body)) fail(file, `보고 필드 ${field} 없음`);
  }
}

// PM 지침의 필수 규칙: 분리된 참조 파일까지 합친 본문에서 확인
const pmText = ['agents/pm-agent.md', 'team/relay-mode.md', 'team/design-tools.md', 'team/strict-mode.md']
  .map((p) => (existsSync(join(root, '.claude', p)) ? readFileSync(join(root, '.claude', p), 'utf8') : ''))
  .join('\n');
for (const [label, re] of PM_RULES) {
  if (!re.test(pmText)) fail('pm-agent 규칙', `필수 규칙 없음: ${label}`);
}

// 문체와 참조 검사
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}
for (const path of walk(root).filter((p) => p.endsWith('.md'))) {
  const text = readFileSync(path, 'utf8');
  const rel = path.slice(root.length + 1);
  // 프롬프트(역할·양식)는 영어 기본, 한글이 섞이면 토큰 효율과 검사 라벨 일관성이 깨지므로 거부
  if (/[가-힣]/.test(text)) fail(rel, '프롬프트는 영어로 작성(한글 포함)');
  for (const phrase of bannedPhrases) {
    if (text.includes(phrase)) fail(rel, `지양 문구 "${phrase}" 포함`);
  }
  for (const m of text.matchAll(/\.claude\/team\/((?:bin\/)?[A-Za-z0-9._-]+\.(?:md|mjs))/g)) {
    const ref = m[1];
    if (generatedRefs.has(ref)) continue;
    if (!existsSync(join(teamDir, ref))) fail(rel, `참조 파일 .claude/team/${ref} 없음`);
  }
}

// settings 조각: 가드 hook 등록과 fail closed 설정 확인
const fragmentPath = join(root, '.claude', 'settings.fragment.json');
if (!existsSync(fragmentPath)) fail('.claude/settings.fragment.json', '파일 없음');
else {
  const fragment = JSON.parse(readFileSync(fragmentPath, 'utf8'));
  if (fragment.agent !== 'pm-agent') fail('settings.fragment.json', 'agent는 pm-agent');
  const pre = (fragment.hooks?.PreToolUse ?? []).flatMap((g) => g.hooks.map((h) => ({ ...h, matcher: g.matcher })));
  const guard = pre.find((h) => /team-guard\.mjs/.test(h.command));
  if (!guard) fail('settings.fragment.json', 'PreToolUse에 team-guard 없음');
  else {
    if (guard.onFailure !== 'block') fail('settings.fragment.json', 'PreToolUse hook에 onFailure block 필요');
    for (const tool of ['Write', 'Edit', 'Agent']) {
      if (!guard.matcher.split('|').includes(tool)) fail('settings.fragment.json', `PreToolUse matcher에 ${tool} 없음`);
    }
    const script = guard.command.match(/(\.claude\/hooks\/[\w.-]+\.mjs)/)?.[1];
    if (!script || !existsSync(join(root, script))) fail('settings.fragment.json', 'hook 스크립트 파일 없음');
  }
  if (!JSON.stringify(fragment.hooks?.PostToolUse ?? []).includes('team-guard')) fail('settings.fragment.json', 'PostToolUse에 team-guard 없음');
}

// 기획안 양식의 12개 구성 번호 확인
const planPath = join(teamDir, 'plan-template.md');
if (existsSync(planPath)) {
  const plan = readFileSync(planPath, 'utf8');
  for (let i = 1; i <= 12; i++) {
    if (!new RegExp(`^## ${i}\\. `, 'm').test(plan)) fail('.claude/team/plan-template.md', `구성 ${i}번 없음`);
  }
} else fail('.claude/team/plan-template.md', '파일 없음');

// 플러그인 배포: 이름은 저장소명과 일치, 제작자 jbeat, 마켓플레이스는 jbeat-plugins(별도 저장소)에서 등록
const repoRoot = join(root, '..');
const pluginDir = join(repoRoot, '.claude-plugin');
const pluginPath = join(pluginDir, 'plugin.json');
let plugin = null;
try {
  plugin = JSON.parse(readFileSync(pluginPath, 'utf8'));
} catch {
  fail('.claude-plugin/plugin.json', '파일 없음 또는 JSON 오류');
}
if (plugin) {
  if (plugin.name !== 'claude-team-base') fail('plugin.json', 'name은 저장소명 claude-team-base');
  if (plugin.author?.name !== 'jbeat') fail('plugin.json', 'author.name은 jbeat');
  if (plugin.skills !== './skills/') fail('plugin.json', 'skills는 ./skills/');
}
const skillsDir = join(repoRoot, 'skills');
const skillNames = existsSync(skillsDir) ? readdirSync(skillsDir) : [];
for (const required of ['setup', 'check']) {
  if (!skillNames.includes(required)) fail('skills', `${required} 스킬 없음`);
}
for (const name of skillNames) {
  const rel = `skills/${name}/SKILL.md`;
  const skillPath = join(skillsDir, name, 'SKILL.md');
  if (!existsSync(skillPath)) {
    fail(rel, '파일 없음');
    continue;
  }
  const fm = parseFrontmatter(readFileSync(skillPath, 'utf8'));
  if (!fm || fm.fields.name !== name) fail(rel, 'frontmatter name이 폴더명과 같아야 함');
}

if (errors.length) {
  console.error(`실패 ${errors.length}건`);
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}
console.log(`통과: 역할 정의 ${agentFiles.length}종, 양식 ${walk(teamDir).length}종 정적 검사 (문구·참조 확인이며 동작 검증 아님)`);
