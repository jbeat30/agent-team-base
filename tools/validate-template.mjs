// template 정적 검사: 역할 정의 frontmatter·도구 제한·참조·문체
// 문구 포함 여부만 확인하며 권한 차단·위임 정확도의 검증이 아님
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'template');
const agentsDir = join(root, '.claude', 'agents');
const teamDir = join(root, '.claude-team');

// 역할별 허용 도구 상한, pm-agent는 Agent 호출 대상 검사를 별도로 수행
const toolCeiling = {
  'planner-agent': ['Read', 'Glob', 'Grep'],
  'architecture-agent': ['Read', 'Glob', 'Grep'],
  'frontend-agent': ['Read', 'Glob', 'Grep', 'Edit', 'Write'],
  'backend-agent': ['Read', 'Glob', 'Grep', 'Edit', 'Write'],
  'api-agent': ['Read', 'Glob', 'Grep', 'Edit', 'Write'],
  'test-agent': ['Read', 'Glob', 'Grep', 'Edit', 'Write'],
  'qa-agent': ['Read', 'Glob', 'Grep', 'Write'],
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
    continue;
  }

  const ceiling = toolCeiling[name];
  if (!ceiling) {
    fail(file, '정의되지 않은 역할, 도구 상한 등록 필요');
    continue;
  }
  for (const tool of tools) {
    if (!ceiling.includes(tool)) fail(file, `허용되지 않은 도구 ${tool}`);
  }
  for (const heading of ['## 공통 규칙', '## 보고 형식']) {
    if (!body.includes(heading)) fail(file, `${heading} 구간 없음`);
  }
  for (const field of reportFields) {
    if (!new RegExp(`^${field}:`, 'm').test(body)) fail(file, `보고 필드 ${field} 없음`);
  }
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
  for (const phrase of bannedPhrases) {
    if (text.includes(phrase)) fail(rel, `지양 문구 "${phrase}" 포함`);
  }
  for (const m of text.matchAll(/\.claude-team\/([A-Za-z0-9._-]+\.md)/g)) {
    const ref = m[1];
    if (generatedRefs.has(ref)) continue;
    if (!existsSync(join(teamDir, ref))) fail(rel, `참조 파일 .claude-team/${ref} 없음`);
  }
}

// 기획안 양식의 12개 구성 번호 확인
const planPath = join(teamDir, 'plan-template.md');
if (existsSync(planPath)) {
  const plan = readFileSync(planPath, 'utf8');
  for (let i = 1; i <= 12; i++) {
    if (!new RegExp(`^## ${i}\\. `, 'm').test(plan)) fail('.claude-team/plan-template.md', `구성 ${i}번 없음`);
  }
} else fail('.claude-team/plan-template.md', '파일 없음');

if (errors.length) {
  console.error(`실패 ${errors.length}건`);
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}
console.log(`통과: 역할 정의 ${agentFiles.length}종, 양식 ${walk(teamDir).length}종 정적 검사 (문구·참조 확인이며 동작 검증 아님)`);
