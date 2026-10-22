// README 그림 team-on-demand: 평소 요청과 /team 호출의 갈래, SVG 원본 생성
// 실행: node tools/images/render_team_on_demand.mjs
// PNG: 같은 폴더의 SVG를 Edge 헤드리스로 2배 해상도 캡처
//   msedge --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 --window-size=2000,700 --user-data-dir=<임시 폴더> --screenshot=<out>.png file:///<svg 경로>
import { writeFileSync } from 'node:fs';

const NAVY = '#1A2744';
const BLUE = '#3B6FD8';
const GRAY = '#9AA5B8';
const LINE = '#D5DBE6';
const BG = '#F5F7FB';

const COPY = {
  ko: {
    font: 'Noto Sans KR, sans-serif',
    user: ['내 요청', ''],
    plain: ['평소처럼 요청', '그냥 말하기'],
    plainEnd: ['Claude가 바로 처리', '간단한 질문 · 작은 수정에 알맞아요'],
    plainNote: '가장 빠르고 토큰이 적어요',
    call: ['팀 호출', '/team 요청 또는 "에이전트 팀으로 해줘"'],
    callMid: ['PM이 분류', '간단하면 바로 처리, 크면 팀이 나서요'],
    callEnd: ['기획 → 확인 → 개발 → 검증', '호출처 · 계약 · 빠뜨린 요구를 챙겨요'],
    callNote: '시간과 토큰이 더 들어요',
  },
  en: {
    font: 'Inter, Noto Sans KR, sans-serif',
    user: ['My request', ''],
    plain: ['Ask as usual', 'just say it'],
    plainEnd: ['Claude handles it directly', 'fits simple questions and small edits'],
    plainNote: 'fastest and cheapest in tokens',
    call: ['Call the team', '/team <request> or ask in words'],
    callMid: ['PM classifies', 'simple: direct, large: team'],
    callEnd: ['Plan → build → verify', 'callers, contracts, missed items'],
    callNote: 'costs more time and tokens',
  },
};

function build(c) {
  const out = [];
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const text = (x, y, s, size, weight, fill) => out.push(`<text x="${x}" y="${y}" dominant-baseline="text-before-edge" font-family="${c.font}" font-size="${size}" font-weight="${weight}" fill="${fill}">${esc(s)}</text>`);
  const card = (x, y, w, h, bar, [title, sub], dark = false) => {
    out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${dark ? NAVY : 'white'}" stroke="${LINE}" stroke-width="1.5"/>`);
    out.push(`<rect x="${x}" y="${y + 12}" width="7" height="${h - 24}" rx="3" fill="${bar}"/>`);
    text(x + 28, y + 30, title, 29, 700, dark ? 'white' : NAVY);
    if (sub) text(x + 28, y + 82, sub, 21, 400, dark ? 'white' : NAVY);
  };
  const arrow = (x1, y1, x2, y2, color = LINE) => {
    out.push(`<line x1="${x1}" y1="${y1}" x2="${x2 - 10}" y2="${y2}" stroke="${color}" stroke-width="3"/>`);
    out.push(`<polygon points="${x2},${y2} ${x2 - 14},${y2 - 8} ${x2 - 14},${y2 + 8}" fill="${color}"/>`);
  };

  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="700" viewBox="0 0 2000 700">`);
  out.push(`<rect width="2000" height="700" fill="${BG}"/>`);

  const ua = { x: 40, y: 280, w: 320, h: 130 };
  card(ua.x, ua.y, ua.w, ua.h, NAVY, c.user);

  // 위쪽 갈래: 평소처럼 요청
  card(470, 60, 430, 160, GRAY, c.plain);
  card(1000, 60, 760, 160, GRAY, c.plainEnd);
  arrow(900, 140, 1000, 140, GRAY);
  text(1000, 245, c.plainNote, 23, 700, GRAY);

  // 아래쪽 갈래: 팀 호출
  card(470, 400, 430, 160, BLUE, c.call);
  card(1000, 400, 420, 160, BLUE, c.callMid);
  card(1520, 400, 440, 160, BLUE, c.callEnd);
  arrow(900, 480, 1000, 480, BLUE);
  arrow(1420, 480, 1520, 480, BLUE);
  text(1000, 585, c.callNote, 23, 700, BLUE);

  // 사용자에서 두 갈래
  out.push(`<polyline points="${ua.x + ua.w},${ua.y + ua.h / 2} 415,${ua.y + ua.h / 2} 415,140 470,140" fill="none" stroke="${GRAY}" stroke-width="3"/>`);
  out.push(`<polyline points="${ua.x + ua.w},${ua.y + ua.h / 2} 415,${ua.y + ua.h / 2} 415,480 470,480" fill="none" stroke="${BLUE}" stroke-width="3"/>`);
  out.push('</svg>');
  return `${out.join('\n')}\n`;
}

for (const lang of ['ko', 'en']) writeFileSync(`docs/assets/team-on-demand.${lang}.svg`, build(COPY[lang]));
console.log('ok');
