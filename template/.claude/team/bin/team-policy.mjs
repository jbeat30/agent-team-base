// 엄격 모드의 승인 범위·계획 스냅샷·등록 일치 검사, 사용자 실행 인증이나 보안 경계가 아닌 변경 감지
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const WRITERS = ['pm-agent', 'frontend-agent', 'backend-agent', 'api-agent', 'test-agent'];
const normalize = (value) => process.platform === 'linux' ? value : value.toLowerCase();
const fail = (message) => { throw new Error(message); };
const within = (path, base) => base === '.' || path === base || path.startsWith(`${base}/`);
const read = (file) => readFileSync(file, 'utf8');

/** @description 승인·등록 스냅샷의 변경 감지용 SHA-256 반환 */
export const hash = (value) => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');

/** @description 프로젝트 내부의 일반 상대 경로 정규화, glob·경로 이탈·링크 거부 */
export function safePath(root, value, allowRoot = false) {
  if (typeof value !== 'string' || !value || /[\x00-\x1f*?\[\]:]/.test(value) || value.includes('\\') || isAbsolute(value) || value.startsWith('//')) fail('일반 상대 경로 필요');
  const clean = value.replace(/\/$/, '');
  if (clean.split('/').some((p) => !p || p === '..') || (!allowRoot && clean === '.')) fail('구체적인 프로젝트 내부 경로 필요');
  const abs = resolve(root, clean);
  const rel = relative(root, abs);
  if (rel.startsWith('..') || isAbsolute(rel)) fail('프로젝트 밖 경로');
  let ancestor = abs;
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  if (normalize(realpathSync.native(ancestor)) !== normalize(ancestor)) fail('symlink·junction 경로 미지원');
  return rel.split(sep).join('/') || '.';
}

/** @description 실행 단위별 계획·요청과 보호 기록 경로 반환 */
export function paths(root, runId) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(runId ?? '')) fail('runId 형식 오류');
  const guard = '.claude-team-docs/.guard';
  const run = `.claude-team-docs/runs/${runId}`;
  for (const path of [guard, run]) safePath(root, path);
  return { guard: join(root, guard), plan: join(root, run, 'plan.md'), request: join(root, run, 'request.md'), approval: join(root, guard, `approval-${runId}.json`), active: join(root, guard, 'active-registration.json'), grant: join(root, guard, 'grant.json') };
}

/** @description 프로필의 보호 모드 확인, 잘못된 값은 거부 */
export function strictMode(root) {
  const file = join(root, '.claude/team/profile.md');
  if (!existsSync(file)) return false;
  const value = read(file).match(/^- 보호 모드:\s*([^\r\n]+)/m)?.[1]?.trim();
  if (value === undefined || value === '권고') return false;
  if (value === '엄격') return true;
  return fail('보호 모드 값 오류');
}

function section(text, number) {
  return text.match(new RegExp(`^## ${number}\\.[^\\n]*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm'))?.[1] ?? '';
}

function rows(text, number) {
  return section(text, number).split(/\r?\n/).filter((line) => line.trim().startsWith('|')).map((line) => line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|').replace(/^`+|`+$/g, ''))).filter((cells) => !/^[-: ]+$/.test(cells[0]));
}

/** @description 사용자 확인용 승인 범위 검증, 보호 경로는 허용 범위에 포함하지 않음 */
export function validateGrant(root, grant) {
  if (!Array.isArray(grant.roots) || !grant.roots.length || !Array.isArray(grant.forbidden) || !Array.isArray(grant.checks) || !Array.isArray(grant.operations) || !grant.operations.length || grant.operations.some((op) => !['수정', '생성'].includes(op)) || typeof grant.allowPmConfirm !== 'boolean') fail('grant의 roots·forbidden·checks·operations 배열과 allowPmConfirm boolean 필요');
  const roots = grant.roots.map((p) => safePath(root, p, true));
  const forbidden = grant.forbidden.map((p) => safePath(root, p, true));
  const checks = grant.checks.map((check) => {
    if (typeof check.command !== 'string' || !check.command.trim() || /[\r\n]/.test(check.command) || !['none', 'approved'].includes(check.sideEffects)) fail('검사 명령·sideEffects(none/approved) 필요');
    return { command: check.command, cwd: safePath(root, check.cwd, true), sideEffects: check.sideEffects };
  });
  return { roots, forbidden, checks, operations: grant.operations, allowPmConfirm: grant.allowPmConfirm };
}

function checkFile(root, grant, file) {
  const path = safePath(root, file);
  const key = normalize(path);
  if (['.git', '.claude', '.claude-team-docs'].some((base) => within(key, base))) fail(`정책·기록 경로는 배정 불가: ${file}`);
  if (!grant.roots.some((base) => within(key, normalize(base))) || grant.forbidden.some((base) => within(key, normalize(base)))) fail(`승인 범위 밖 또는 금지 경로: ${file}`);
  return path;
}

/** @description 현재 grant와 기획안의 파일·검사 명령을 대조하고 해시 스냅샷 생성 */
export function snapshot(root, runId) {
  const p = paths(root, runId);
  const saved = JSON.parse(read(p.grant));
  if (saved.schemaVersion !== 1 || normalize(saved.projectRoot ?? '') !== normalize(root)) fail('승인 범위의 프로젝트 불일치');
  const grant = validateGrant(root, saved.scope);
  const text = read(p.plan);
  if (!/^- 상태:\s*confirmed\s*$/m.test(text)) fail('기획안 confirmed 상태 필요');
  if (text.match(/^- runId:\s*(\S+)/m)?.[1] !== runId) fail('기획안 runId 불일치');
  const files = rows(text, 6).filter((cells) => cells[0] !== '순서').map((cells) => {
    if (cells.length !== 5 || !WRITERS.includes(cells[4]) || !grant.operations.includes(cells[3])) fail('변경 계획은 수정/생성 작업과 담당 역할 필요, 삭제·이동은 미지원');
    return { file: checkFile(root, grant, cells[1]), operation: cells[3], role: cells[4] };
  });
  if (!files.length || new Set(files.map((f) => normalize(f.file))).size !== files.length) fail('배정 파일 누락·중복');
  const checks = rows(text, 8).filter((cells) => cells[0] !== '명령').map((cells) => {
    if (cells.length !== 3) fail('검사 명령 표 형식 오류');
    const cwd = safePath(root, cells[1], true);
    const scope = grant.checks.find((c) => c.command === cells[0] && normalize(c.cwd) === normalize(cwd));
    const noSideEffect = cells[2] === '없음';
    if (!scope || (scope.sideEffects === 'none' && !noSideEffect)) fail('승인 범위 밖 검사 명령·부작용');
    return { command: cells[0], cwd, sideEffects: noSideEffect ? 'none' : 'approved' };
  });
  const risk = text.match(/^- 위험도:\s*(L[123])\s*$/m)?.[1];
  if (!risk) fail('기획안 위험도 L1/L2/L3 필요');
  // PM 판정의 의미 정확성은 행동 평가 대상이며 이 표식만으로 사용자 의도를 인증하지 않음
  const pmEligible = grant.allowPmConfirm && risk !== 'L3' && /^- 사용자 승인 필요:\s*없음\s*$/m.test(section(text, 10));
  return { schemaVersion: 1, runId, grantSha256: hash(saved), requestSha256: hash(read(p.request)), planSha256: hash(text), files, checks, pmEligible };
}

/** @description 등록 이후 계획·요청·승인 범위·직접 승인 기록 변경 검사 */
export function verifyRegistration(root, runId) {
  const p = paths(root, runId);
  const active = JSON.parse(read(p.active));
  const current = snapshot(root, runId);
  if (active.runId !== runId || hash(active.snapshot) !== hash(current)) fail('등록 이후 계획·요청·승인 범위 변경, 재등록 필요');
  if (active.confirmedBy === 'user') {
    const receipt = JSON.parse(read(p.approval));
    if (hash(receipt) !== active.approvalSha256 || hash(receipt.snapshot) !== hash(current)) fail('사용자 승인 기록 변경·불일치');
  } else if (active.confirmedBy !== 'pm-agent' || !current.pmEligible) fail('PM 자체 컨펌 허용 범위 아님');
  return active;
}

/** @description 활성 등록과 역할별 정확한 허용 파일을 대조 */
export function verifyWrite(root, file, role, runId) {
  const p = paths(root, runId ?? 'active');
  const active = runId ? verifyRegistration(root, runId) : verifyRegistration(root, JSON.parse(read(p.active)).runId);
  const match = active.snapshot.files.find((entry) => normalize(entry.file) === normalize(file) && entry.role === role);
  if (!match) fail(`등록에 배정되지 않은 파일: ${file}`);
  return active;
}
