// 실행기 출력 폴더에서 비용·시간·토큰·결과를 모아 JSON 배열로 출력
// 사용법: node collect.mjs <그룹 이름> <출력 폴더> [<출력 폴더> ...] > results-<그룹>.json
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const [group, ...dirs] = process.argv.slice(2);
if (!group || dirs.length === 0) throw new Error('사용법: collect.mjs <그룹 이름> <출력 폴더> ...');

// 결과 이벤트의 토큰 합산, 캐시 읽기는 입력과 분리해 비용 영향 확인
function tokensOf(eventsFile) {
  const events = readFileSync(eventsFile, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const usage = events.find((e) => e.type === 'result')?.usage ?? {};
  return {
    input: usage.input_tokens ?? 0,
    cacheCreation: usage.cache_creation_input_tokens ?? 0,
    cacheRead: usage.cache_read_input_tokens ?? 0,
    output: usage.output_tokens ?? 0,
  };
}

const rows = [];
for (const dir of dirs) {
  for (const name of readdirSync(dir).filter((n) => /^(direct|lite|full)-\w+\.json$/.test(n)).sort()) {
    const summary = JSON.parse(readFileSync(join(dir, name), 'utf8'));
    rows.push({
      group,
      mode: summary.condition,
      task: summary.taskId,
      costUsd: Number((summary.costUsd ?? 0).toFixed(3)),
      wallSec: Math.round(summary.wallMs / 1000),
      tokens: tokensOf(join(dir, name.replace(/\.json$/, '.events.jsonl'))),
      budgetStopped: summary.subtype === 'error_max_budget_usd',
      testsPass: summary.testsPass,
      delegations: summary.delegations,
      changedFiles: summary.changedFiles.length,
    });
  }
}
console.log(JSON.stringify(rows, null, 2));
