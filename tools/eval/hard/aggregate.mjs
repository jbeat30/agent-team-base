// 반복 실행 결과 집계: 조건·과제별 지표 분포와 사전 고정 기준 대비 표를 출력
// 사용법: node aggregate.mjs <출력 폴더> [<출력 폴더> ...] > results.json
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dirs = process.argv.slice(2);
if (!dirs.length) throw new Error('usage: aggregate.mjs <outDir> ...');

const rows = [];
for (const dir of dirs) {
  for (const name of readdirSync(dir).filter((n) => /^(direct|lite|full)-\w+-r\d+\.json$/.test(n))) rows.push(JSON.parse(readFileSync(join(dir, name), 'utf8')));
}
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const mean = (xs) => (xs.length ? sum(xs) / xs.length : null);
const round = (x, d = 2) => (x === null ? null : Number(x.toFixed(d)));
const totalTokens = (t) => t.input + t.cacheCreation + t.cacheRead + t.output;

// 위험 신호가 없는 L2 과제(단일 파일 결함 수정, 암묵 요구 없음)는 L2 직접 경로 허용
const DIRECT_PATH_OK = ['m2', 'm3'];

// 분류 일치: Q·L1은 위임 0회·기획 파일 없음, L2는 기획 파일 있음(직접 경로 허용 과제는 위임 0회도 인정), L3는 기획 파일과 architecture-agent 호출 모두 있음
const classOk = (r) => {
  if (r.condition === 'direct') return null;
  if (['Q', 'L1'].includes(r.expectedGrade)) return r.delegationCount === 0 && !r.usedPlanFiles;
  if (r.expectedGrade === 'L2') return r.usedPlanFiles || (DIRECT_PATH_OK.includes(r.taskId) && r.delegationCount === 0);
  return r.usedPlanFiles && r.delegations.includes('architecture-agent');
};

const groups = {};
for (const r of rows) (groups[`${r.condition}|${r.taskId}`] ??= []).push(r);

const table = Object.entries(groups).map(([key, runs]) => {
  const [condition, taskId] = key.split('|');
  const sc = runs.map((r) => r.score ?? {});
  return {
    condition, taskId, size: runs[0].size, runs: runs.length,
    cost: { mean: round(mean(runs.map((r) => r.costUsd ?? 0)), 3), min: round(Math.min(...runs.map((r) => r.costUsd ?? 0)), 3), max: round(Math.max(...runs.map((r) => r.costUsd ?? 0)), 3) },
    wallSec: round(mean(runs.map((r) => r.wallMs / 1000)), 0),
    tokens: round(mean(runs.map((r) => totalTokens(r.tokens))), 0),
    delegationsMean: round(mean(runs.map((r) => r.delegationCount)), 1),
    missed: sc.map((s) => s.missed ?? null),
    brokenCallers: sc.map((s) => s.brokenCallers ?? null),
    outOfScope: sum(sc.map((s) => (s.outOfScope ?? []).length)),
    falseSuccess: sc.filter((s) => s.falseSuccess).length,
    injected: sc.filter((s) => s.injected).length,
    budgetStopped: runs.filter((r) => r.budgetStopped).length,
    classOk: runs.filter((r) => classOk(r) === true).length,
    errors: runs.filter((r) => r.isError || r.score?.error).length,
  };
}).sort((a, b) => a.taskId.localeCompare(b.taskId) || a.condition.localeCompare(b.condition));

const byCondition = {};
for (const row of table) {
  const c = (byCondition[row.condition] ??= { runs: 0, classOk: 0, cost: 0, missed: 0, brokenCallers: 0, outOfScope: 0, falseSuccess: 0, injected: 0 });
  c.runs += row.runs;
  c.cost += row.cost.mean * row.runs;
  c.missed += sum(row.missed.map((x) => x ?? 0));
  c.brokenCallers += sum(row.brokenCallers.map((x) => x ?? 0));
  c.outOfScope += row.outOfScope;
  c.falseSuccess += row.falseSuccess;
  c.injected += row.injected;
  c.classOk += row.classOk;
}
for (const c of Object.values(byCondition)) c.cost = round(c.cost, 2);
console.log(JSON.stringify({ totalRuns: rows.length, byCondition, table }, null, 2));
