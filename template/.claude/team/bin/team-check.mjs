#!/usr/bin/env node
// 검사 실행기: 승인된 기획안의 검사 명령만 실행하고 원본 출력·exit code·시각·해시를 가공 없이 기록
// 프로젝트 루트에서 실행, 기록을 생성하는 주체는 이 스크립트이며 메인이 기록을 위조하는 경우까지는 방어하지 않음
// 종료 코드: 0 기록 생성 또는 검증 통과, 1 검증 실패, 2 거부·오류 (검사 명령의 exit code는 record.json에 기록)
//
// 사용법
//   node .claude/team/bin/team-check.mjs run <runId> "<검사 명령>" [--allow-side-effects]
//   node .claude/team/bin/team-check.mjs verify <runId>
//   node .claude/team/bin/team-check.mjs diff <runId> [--base <ref>]
//   node .claude/team/bin/team-check.mjs trace <runId>
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, realpathSync } from 'node:fs';
import { join, relative, resolve, isAbsolute } from 'node:path';

import { strictMode, verifyRegistration, paths as approvalPaths, hash as approvalHash } from './team-policy.mjs';

const VERSION = '0.1.0';
const MAX_BUFFER = 256 * 1024 * 1024;
const root = realpathSync.native(process.cwd());

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const die = (message) => {
  console.error(`team-check: ${message}`);
  process.exit(2);
};

function strictRegistration(runId) {
  try {
    return strictMode(root) ? verifyRegistration(root, runId) : null;
  } catch (error) {
    return die(error.message);
  }
}

function runDir(runId) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(runId ?? '')) die(`invalid runId format: ${runId}`);
  const dir = join(root, '.claude-team-docs', 'runs', runId);
  if (!existsSync(dir)) die(`run directory not found: ${dir}`);
  return dir;
}

function readPlan(dir) {
  const planPath = join(dir, 'plan.md');
  if (!existsSync(planPath)) die('plan.md not found');
  const buffer = readFileSync(planPath);
  return { text: buffer.toString('utf8'), hash: sha256(buffer) };
}

// 기획안 8장 표에서 승인된 검사 명령을 추출, 셀 안의 \| 는 | 로 복원
function parseAllowedChecks(planText) {
  const start = planText.search(/^## 8\./m);
  if (start < 0) die('plan section 8 (check commands) not found');
  const rest = planText.slice(start).split(/\r?\n/).slice(1);
  const rows = [];
  for (const line of rest) {
    if (/^## /.test(line)) break;
    if (!line.trim().startsWith('|') || /^\|\s*-/.test(line.trim())) continue;
    const cells = line
      .trim()
      .replace(/^\||\|$/g, '')
      .split(/(?<!\\)\|/)
      .map((c) => c.trim().replace(/\\\|/g, '|'));
    const command = (cells[0] ?? '').replace(/^`+|`+$/g, '').trim();
    if (!command || command === 'Command') continue;
    rows.push({ command, cwd: cells[1] ?? '', sideEffect: cells[2] ?? '' });
  }
  return rows;
}

function resolveCwd(cell) {
  const value = cell.replace(/^`+|`+$/g, '').trim();
  if (!value || value === '.' || value === 'project root') return root;
  if (isAbsolute(value)) die(`working directory must be a relative path inside the project: ${value}`);
  const full = resolve(root, value);
  const rel = relative(root, full);
  if (rel.startsWith('..') || isAbsolute(rel)) die(`working directory is outside the project: ${value}`);
  if (!existsSync(full)) die(`working directory not found: ${value}`);
  return full;
}

function nextIndex(checksDir) {
  if (!existsSync(checksDir)) return 1;
  const used = readdirSync(checksDir).filter((n) => /^\d+$/.test(n)).map(Number);
  return used.length ? Math.max(...used) + 1 : 1;
}

function cmdRun(args) {
  const allowSideEffects = args.includes('--allow-side-effects');
  const positional = args.filter((a) => a !== '--allow-side-effects');
  const [runId, ...commandParts] = positional;
  const command = commandParts.join(' ').trim();
  if (!command) die('check command required');
  const dir = runDir(runId);
  const plan = readPlan(dir);
  const registration = strictRegistration(runId);
  const entry = parseAllowedChecks(plan.text).find((row) => row.command === command);
  if (!entry) die(`commands not in plan section 8 are not run: ${command}`);
  const clean = /^none/.test(entry.sideEffect);
  if (!clean && !allowSideEffects) {
    die(`side-effect class is not 'none' for command(${entry.sideEffect || 'unclassified'}); rerun with --allow-side-effects after user approval`);
  }
  const cwd = resolveCwd(entry.cwd);

  const checksDir = join(dir, 'checks');
  const outDir = join(checksDir, String(nextIndex(checksDir)).padStart(2, '0'));
  mkdirSync(outDir, { recursive: true });

  const startedAt = new Date().toISOString();
  const result = spawnSync(command, { cwd, shell: true, maxBuffer: MAX_BUFFER });
  const endedAt = new Date().toISOString();

  const stdout = result.stdout ?? Buffer.alloc(0);
  const stderr = result.stderr ?? Buffer.alloc(0);
  writeFileSync(join(outDir, 'stdout.txt'), stdout);
  writeFileSync(join(outDir, 'stderr.txt'), stderr);
  const record = {
    command,
    cwd: relative(root, cwd) || '.',
    startedAt,
    endedAt,
    exitCode: result.status,
    signal: result.signal,
    spawnError: result.error ? String(result.error.message) : null,
    sideEffectsApproved: !clean && allowSideEffects,
    planSha256: plan.hash,
    registrationSha256: registration ? approvalHash(registration) : null,
    stdoutSha256: sha256(stdout),
    stderrSha256: sha256(stderr),
    runner: `team-check ${VERSION}`,
    nodeVersion: process.version,
    source: 'check record source: run by the main session with the runner',
  };
  writeFileSync(join(outDir, 'record.json'), `${JSON.stringify(record, null, 2)}\n`);
  if (registration) {
    const indexPath = join(approvalPaths(root, runId).guard, `check-index-${runId}.json`);
    const index = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')) : {};
    index[relative(dir, outDir).replaceAll('\\', '/')] = approvalHash(readFileSync(join(outDir, 'record.json')));
    writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
  }
  console.log(JSON.stringify({ recordDir: relative(root, outDir), exitCode: record.exitCode, signal: record.signal }));
}

function cmdVerify(args) {
  const [runId] = args;
  const dir = runDir(runId);
  const planHash = readPlan(dir).hash;
  const registration = strictRegistration(runId);
  const checksDir = join(dir, 'checks');
  const indices = existsSync(checksDir) ? readdirSync(checksDir).filter((n) => /^\d+$/.test(n)).sort() : [];
  if (!indices.length) {
    console.log(JSON.stringify({ ok: false, reason: 'no check record' }));
    process.exit(1);
  }
  const problems = [];
  for (const index of indices) {
    const base = join(checksDir, index);
    const recordPath = join(base, 'record.json');
    if (!existsSync(recordPath)) {
      problems.push(`${index}: record.json not found`);
      continue;
    }
    const record = JSON.parse(readFileSync(recordPath, 'utf8'));
    for (const [file, key] of [['stdout.txt', 'stdoutSha256'], ['stderr.txt', 'stderrSha256']]) {
      const path = join(base, file);
      if (!existsSync(path)) problems.push(`${index}: ${file} not found`);
      else if (sha256(readFileSync(path)) !== record[key]) problems.push(`${index}: ${file} hash mismatch`);
    }
    if (registration) {
      const indexPath = join(approvalPaths(root, runId).guard, `check-index-${runId}.json`);
      const indexData = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')) : {};
      if (indexData[`checks/${index}`] !== approvalHash(readFileSync(recordPath))) problems.push(`${index}: check record hash mismatch`);
      if (record.registrationSha256 !== approvalHash(registration)) problems.push(`${index}: approval registration changed`);
    }
    if (record.planSha256 !== planHash) problems.push(`${index}: the plan changed after the record`);
  }
  console.log(JSON.stringify({ ok: problems.length === 0, records: indices.length, problems }));
  process.exit(problems.length ? 1 : 0);
}

function git(args, options = {}) {
  return spawnSync('git', args, { cwd: root, maxBuffer: MAX_BUFFER, ...options });
}

// 추적 파일 diff와 미추적 파일의 신규 diff를 원문 그대로 저장, 실행 산출물 디렉터리는 제외
function cmdDiff(args) {
  const baseIndex = args.indexOf('--base');
  const base = baseIndex >= 0 ? args[baseIndex + 1] : 'HEAD';
  const positional = baseIndex >= 0 ? args.filter((_, i) => i !== baseIndex && i !== baseIndex + 1) : args;
  const runId = positional[0];
  const dir = runDir(runId);
  if (git(['rev-parse', '--is-inside-work-tree']).status !== 0) die('not a git repository');
  if (git(['rev-parse', '--verify', `${base}^{commit}`]).status !== 0) die(`base commit not found: ${base}`);

  const exclude = ':(exclude).claude-team-docs/runs';
  const tracked = git(['diff', '--no-color', '--no-ext-diff', base, '--', '.', exclude]);
  if (tracked.status !== 0) die(`git diff failed: ${tracked.stderr}`);
  const listed = git(['ls-files', '--others', '--exclude-standard', '-z', '--', '.', exclude]);
  const untracked = listed.stdout.toString('utf8').split('\0').filter(Boolean);

  const chunks = [tracked.stdout];
  for (const file of untracked) {
    const added = git(['diff', '--no-color', '--no-index', '--', '/dev/null', file]);
    if (added.status !== 0 && added.status !== 1) die(`new file diff failed (${file}): ${added.stderr}`);
    chunks.push(added.stdout);
  }
  const patch = Buffer.concat(chunks);
  const patchPath = join(dir, 'changes.patch');
  writeFileSync(patchPath, patch);
  const changed = git(['diff', '--name-only', base, '--', '.', exclude]).stdout.toString('utf8').split('\n').filter(Boolean);
  console.log(
    JSON.stringify({
      patch: relative(root, patchPath),
      bytes: patch.length,
      sha256: sha256(patch),
      trackedFiles: changed,
      untrackedFiles: untracked,
    }),
  );
}

const squash = (text) => text.replace(/\s+/g, ' ').trim();
const stripCell = (cell) => (cell ?? '').replace(/^`+|`+$/g, '').trim();

function splitRow(line) {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|'));
}

// 기획안 N장의 표 본문 행(헤더·구분선 제외)을 셀 배열로 추출
function planTable(planText, chapter) {
  const start = planText.search(new RegExp(`^## ${chapter}\\.`, 'm'));
  if (start < 0) return null;
  const rows = [];
  let header = true;
  for (const line of planText.slice(start).split(/\r?\n/).slice(1)) {
    if (/^## /.test(line)) break;
    if (!line.trim().startsWith('|')) continue;
    if (/^\|\s*-/.test(line.trim())) {
      header = false;
      continue;
    }
    if (!header) rows.push(splitRow(line));
  }
  return rows;
}

// 1장 인용 블록 전체를 이어 붙여 반환
function planQuote(planText) {
  const start = planText.search(/^## 1\./m);
  if (start < 0) return null;
  const quoted = [];
  for (const line of planText.slice(start).split(/\r?\n/).slice(1)) {
    if (/^## /.test(line)) break;
    if (line.startsWith('>')) quoted.push(line.replace(/^>\s?/, ''));
  }
  return quoted.join('\n');
}

// 호출 카드의 `- 항목:` 값과 `## Request source` 인용 블록 추출
function parseCard(text) {
  const field = (name) => text.match(new RegExp(`^- ${name}[^:\\n]*:[ \\t]*(.*)$`, 'm'))?.[1]?.trim() ?? '';
  const quote = text.split(/^## Request source\s*$/m)[1];
  return {
    runId: field('runId'),
    planHash: field('Plan path and hash').match(/\b[0-9a-f]{64}\b/)?.[0] ?? null,
    ids: field('Assigned requirements').match(/\bR\d+\b/g) ?? [],
    files: field('Allowed files').split(',').map((f) => stripCell(f).replace(/^\.\//, '')).filter((f) => f && f !== 'none'),
    quote: quote === undefined ? null : quote.split(/\r?\n/).filter((l) => l.startsWith('>')).map((l) => l.replace(/^>\s?/, '')).join('\n'),
  };
}

// 요청 원문 → 기획안 → 호출 카드 → 보고 → diff로 이어지는 요구·인수 기준·파일 범위 보존 대조
// 기록 파일의 작성자를 인증하지 않는 일관성 검사이며 구현 정확성이나 요구 충족의 증명이 아님
function cmdTrace(args) {
  const [runId] = args;
  const dir = runDir(runId);
  const plan = readPlan(dir);
  const requestPath = join(dir, 'request.md');
  if (!existsSync(requestPath)) die('request.md not found');
  const request = readFileSync(requestPath, 'utf8');
  const problems = [];
  const notes = [];

  if (!squash(request)) problems.push('request.md is empty');
  else if (!squash(planQuote(plan.text) ?? '').includes(squash(request))) problems.push('plan section 1 does not contain the full request source');

  const reqRows = planTable(plan.text, 2);
  const doneRows = planTable(plan.text, 7);
  if (!reqRows || !doneRows) die('plan section 2 or 7 table not found');
  const ids = reqRows.map((r) => stripCell(r[0])).filter((id) => /^R\d+$/.test(id));
  if (!ids.length) problems.push('no requirement ID in section 2');
  if (new Set(ids).size !== ids.length) problems.push('duplicate requirement ID in section 2');
  const flat = squash(request);
  for (const row of reqRows) {
    const id = stripCell(row[0]);
    if (!/^R\d+$/.test(id)) continue;
    const evidence = squash(stripCell(row[2]).replace(/^["“>]+|["”]+$/g, ''));
    if (!evidence) problems.push(`${id}: no source quote`);
    else if (!flat.includes(evidence)) problems.push(`${id}: the source quote is not in request.md`);
  }
  const doneIds = new Set();
  for (const row of doneRows) {
    const id = stripCell(row[0]);
    if (!/^R\d+$/.test(id)) continue;
    doneIds.add(id);
    if (![1, 2, 3].every((i) => stripCell(row[i]))) problems.push(`${id}: completion criteria Given/When/Then is empty`);
  }
  for (const id of ids) if (!doneIds.has(id)) problems.push(`${id}: no completion criteria in section 7`);
  for (const id of doneIds) if (!ids.includes(id)) problems.push(`${id}: completion criteria for an ID not in section 2`);

  const changeRows = planTable(plan.text, 6) ?? [];
  const planned = new Map();
  for (const row of changeRows) {
    const file = stripCell(row[1]).replace(/\\/g, '/').replace(/^\.\//, '');
    if (!file || file === 'File') continue;
    planned.set(file, stripCell(row[4]));
  }

  const cardsDir = join(dir, 'cards');
  const cardFiles = existsSync(cardsDir) ? readdirSync(cardsDir).filter((n) => /^\d{2}-[a-z-]+\.md$/.test(n)).sort() : [];
  const covered = new Set();
  for (const name of cardFiles) {
    const role = name.slice(3, -3);
    const card = parseCard(readFileSync(join(cardsDir, name), 'utf8'));
    if (card.runId !== runId) problems.push(`cards/${name}: runId mismatch`);
    if (card.quote === null || squash(card.quote) !== flat) problems.push(`cards/${name}: the card's request source differs from request.md`);
    if (card.planHash && card.planHash !== plan.hash) problems.push(`cards/${name}: the card's plan hash differs from the current plan`);
    for (const id of card.ids) {
      if (!ids.includes(id)) problems.push(`cards/${name}: requirement not in the plan ${id}`);
      else covered.add(id);
    }
    for (const file of card.files) {
      if (!planned.has(file)) problems.push(`cards/${name}: file not in plan section 6 ${file}`);
      else if (planned.get(file) !== role) problems.push(`cards/${name}: ${file} is owned by ${planned.get(file)}, but the card receiver is ${role}`);
    }
  }
  const writerCards = cardFiles.filter((n) => /-(frontend|backend|api|test)-agent\.md$/.test(n));
  if (writerCards.length) for (const id of ids) if (!covered.has(id)) problems.push(`${id}: not assigned to any worker card`);
  if (!cardFiles.length) notes.push('no call card records (cards/NN-<role>.md); card stage comparison skipped');

  const reportsDir = join(dir, 'reports');
  for (const name of ['dev-lead.md', 'qa-final.md']) {
    const path = join(reportsDir, name);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, 'utf8');
    for (const id of ids) if (!new RegExp(`\\b${id}\\b`).test(text)) problems.push(`reports/${name}: ${id} not mentioned`);
  }

  const patchPath = join(dir, 'changes.patch');
  if (existsSync(patchPath)) {
    const patch = readFileSync(patchPath, 'utf8');
    const changed = new Set([...patch.matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm)].map((m) => m[2]));
    for (const file of changed) if (!planned.has(file)) problems.push(`changes.patch: changed file not in plan section 6 ${file}`);
  } else notes.push('no changes.patch; file scope diff comparison skipped');

  console.log(JSON.stringify({ ok: problems.length === 0, requirements: ids.length, cards: cardFiles.length, problems, notes }));
  process.exit(problems.length ? 1 : 0);
}

const [command, ...rest] = process.argv.slice(2);
if (command === 'run') cmdRun(rest);
else if (command === 'verify') cmdVerify(rest);
else if (command === 'diff') cmdDiff(rest);
else if (command === 'trace') cmdTrace(rest);
else die('usage: run <runId> "<command>" | verify <runId> | diff <runId> [--base <ref>] | trace <runId>');
