// 수집한 결과 JSON으로 모드별 비용·시간·토큰 비교 SVG 생성, 라이트·다크 자동 전환
// 사용법: node report.mjs <결과 JSON 폴더> <출력 SVG>
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [dataDir, outFile] = process.argv.slice(2);
if (!dataDir || !outFile) throw new Error('사용법: report.mjs <결과 JSON 폴더> <출력 SVG>');

const rows = readdirSync(dataDir).filter((n) => /^results-.*\.json$/.test(n)).flatMap((n) => JSON.parse(readFileSync(join(dataDir, n), 'utf8')));
const tasks = [['q', 'Q 설명'], ['l1', 'L1 오탈자'], ['l2', 'L2 기능 추가'], ['l3', 'L3 계약 변경']];
// 계열 순서는 팔레트 슬롯 순서와 대응
const series = [
  { id: 'direct', label: '직접 처리', match: (r) => r.group === 'initial' && r.mode === 'direct', cls: 's1' },
  { id: 'lite-before', label: 'Lite (L2 조건부 호출 전)', match: (r) => r.group === 'initial' && r.mode === 'lite', cls: 's2' },
  { id: 'lite-after', label: 'Lite (변경 후)', match: (r) => r.group === 'final' && r.mode === 'lite', cls: 's3' },
  { id: 'full', label: 'Full relay (사용자 확인에서 정지)', match: (r) => r.group === 'initial' && r.mode === 'full', cls: 's4' },
];
const total = (t) => t.input + t.cacheCreation + t.cacheRead + t.output;
const panels = [
  { title: '비용 (환산 USD)', value: (r) => r.costUsd, format: (v) => `$${v.toFixed(2)}` },
  { title: '소요 시간 (초)', value: (r) => r.wallSec, format: (v) => `${v}` },
  { title: '총 토큰 (천 개, 캐시 읽기 포함)', value: (r) => total(r.tokens) / 1000, format: (v) => (v >= 100 ? `${Math.round(v)}` : v.toFixed(0)) },
];

const W = 960;
const left = 56;
const right = 16;
const panelH = 190;
const top = 76;
const gap = 58;
const barW = 34;
const barGap = 3;
const H = top + panels.length * (panelH + gap) + 24;
const groupW = (W - left - right) / tasks.length;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

let body = '';
series.forEach((s, i) => {
  const x = left + i * 200;
  body += `<rect x="${x}" y="22" width="12" height="12" rx="3" class="${s.cls}"/><text x="${x + 18}" y="32" class="txt2">${esc(s.label)}</text>`;
});

panels.forEach((panel, p) => {
  const y0 = top + p * (panelH + gap);
  const base = y0 + panelH;
  const plotH = panelH - 26;
  const max = Math.max(...rows.map((r) => (tasks.some(([t]) => t === r.task) ? panel.value(r) : 0)), 1);
  body += `<text x="${left}" y="${y0 - 10}" class="title">${esc(panel.title)}</text>`;
  body += `<line x1="${left}" y1="${base}" x2="${W - right}" y2="${base}" class="axis"/>`;
  tasks.forEach(([task, label], g) => {
    const gx = left + g * groupW + groupW / 2;
    body += `<text x="${gx}" y="${base + 16}" text-anchor="middle" class="txt2">${esc(label)}</text>`;
    const present = series.map((s) => ({ s, row: rows.find((r) => r.task === task && s.match(r)) }));
    const cluster = series.length * barW + (series.length - 1) * barGap;
    present.forEach(({ s, row }, i) => {
      if (!row) return;
      const v = panel.value(row);
      const h = Math.max(2, (v / max) * plotH);
      const x = gx - cluster / 2 + i * (barW + barGap);
      body += `<path d="M${x},${base} V${base - h + 4} Q${x},${base - h} ${x + 4},${base - h} H${x + barW - 4} Q${x + barW},${base - h} ${x + barW},${base - h + 4} V${base} Z" class="${s.cls}"/>`;
      const note = row.budgetStopped ? '*' : '';
      body += `<text x="${x + barW / 2}" y="${base - h - 5}" text-anchor="middle" class="val">${panel.format(v)}${note}</text>`;
    });
  });
});
body += `<text x="${left}" y="${H - 6}" class="txt2">* 호출당 예산 상한에서 중단. 과제당 1회 측정이며 통계적 비교가 아님. 비용은 CLI가 보고한 환산 값.</text>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="직접 처리, Lite, Full의 과제별 비용·시간·토큰 비교">
<style>
  :root { --bg:#fcfcfb; --ink:#0b0b0b; --ink2:#52514e; --axis:#d5d4cf; --s1:#2a78d6; --s2:#eb6834; --s3:#1baf7a; --s4:#eda100; }
  @media (prefers-color-scheme: dark) { :root { --bg:#1a1a19; --ink:#f0efec; --ink2:#c3c2b7; --axis:#3a3a37; --s1:#3987e5; --s2:#d95926; --s3:#199e70; --s4:#c98500; } }
  svg { font-family: -apple-system, 'Segoe UI', 'Noto Sans KR', sans-serif; }
  .bg { fill: var(--bg); } .title { fill: var(--ink); font-size: 14px; font-weight: 600; }
  .txt2 { fill: var(--ink2); font-size: 12px; } .val { fill: var(--ink); font-size: 11px; }
  .axis { stroke: var(--axis); stroke-width: 1; }
  .s1 { fill: var(--s1); } .s2 { fill: var(--s2); } .s3 { fill: var(--s3); } .s4 { fill: var(--s4); }
</style>
<rect class="bg" width="${W}" height="${H}"/>
${body}
</svg>
`;
writeFileSync(outFile, svg);
console.log(`${outFile} (${rows.length}건)`);
