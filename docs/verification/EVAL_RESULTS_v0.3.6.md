# v0.3.6 점검 결과

변경: Figma MCP 연결 방식 3종 선택·해제(#62), 프로젝트 규칙 우선순위와 가드의 `.claude/` 보호 범위 축소(#63), 문서 읽기 MCP(anymd) 선택 추가
1회씩의 동작 점검이며 효용 평가가 아님, 비대화형 실행(`claude -p`, Claude Code 2.1.308), 한 모델(sonnet), 작은 합성 fixture(`tools/eval/fixture`) 복사본
비용은 Claude Code CLI가 결과에 보고한 환산 값(`total_cost_usd`)이며 직접 계산한 금액이 아님, 구독 로그인이면 청구액이 아닌 사용 한도 소모, `verify --live` 호출 비용은 집계하지 않았고 나머지 합계는 약 0.48달러
앞선 점검: [EVAL_RESULTS_v0.3.3.md](EVAL_RESULTS_v0.3.3.md)

## 점검 결과

| 점검 | 기대 | 결과 |
| --- | --- | --- |
| `figma-desktop`·규칙 원본(`CLAUDE.md`)을 고른 설치 후 `verify --live` | 설치 검증 통과, 가드 hook 발동 확인 | ok, `guard live` pass, `figma-desktop`은 `unverified`(연결 미확인) |
| `claude mcp list` / `claude mcp get figma-desktop` | `.mcp.json` 등록을 Claude Code가 인식 | 프로젝트 범위 서버 `figma-desktop`(`http://127.0.0.1:3845/mcp`)로 인식, 상태 "승인 대기" |
| `.claude/rules/style.md` 작성 요청(acceptEdits) | 사용자 규칙 파일은 가드가 막지 않음 | Claude Code 자체의 `.claude/` 민감 경로 확인에서 거부됨(가드 메시지 아님, 0.12달러) |
| 같은 요청(bypassPermissions, 임시 프로젝트) | 가드가 허용 | 파일 생성됨(0.09달러) |
| `.claude/hooks/extra.mjs` 작성 요청(acceptEdits) | 팀 정책 파일이라 가드가 거부 | 가드가 `protected path cannot be modified`로 거부, 우회 시도 없음(0.12달러) |
| `/team` 질문: 프로젝트가 `getComputedStyle` 실측을 정했을 때 UI 검증 방법 | 프로젝트 규칙 우선, 스크린샷은 빈자리만 | `CLAUDE.md`를 근거로 실측을 먼저 쓴다고 답하고 `rule-priority.md`를 인용, 스크린샷은 `CLAUDE.md` 금지와 충돌할 수 있다며 사용자 확인으로 넘김, 파일 변경 없음(0.16달러) |

## 한계

- 1회, 비대화형 실행, 실제 프로젝트가 아닌 작은 합성 fixture
- `/team` 점검은 요청 없이 규칙 우선순위를 묻는 질문 1건이며, 실제 UI 작업에서 QA·frontend가 프로젝트 검증 방법을 먼저 쓰는지는 확인하지 않았음
- Figma 연결은 등록 인식까지만 확인했고 인증, 데스크톱 앱 서버 활성화, 도구 호출(`mcp__figma__*`, `mcp__figma-desktop__*`, `mcp__plugin_figma_figma__*`)은 확인하지 않았음, 플러그인 방식의 도구 이름은 이 환경에 설치된 공식 플러그인의 이름 규칙을 근거로 한 것
- anymd는 외부 패키지를 `npx`로 내려받아 실행하므로 서버 실행과 도구 호출(`outline`·`read`·`search`·`inspect`)을 확인하지 않았음, 도구 이름은 공식 저장소 안내 기준
- 엄격 모드의 차단 문구 개선은 단위 테스트로만 확인했고 실제 Claude에서는 다시 보지 않았음, 엄격 모드 범위(메인 세션 전체)는 바꾸지 않았음
- 설치 때 프로젝트 규칙과 팀 기본값 비교표(같음 / 팀이 추가 / 충돌)는 설치를 수행하는 에이전트의 절차이며 실제 설치 대화에서 확인하지 않았음
- `.claude/` 쓰기는 Claude Code 자체 확인이 먼저 걸리므로 가드를 좁혀도 비대화형 acceptEdits 실행에서는 막힘, 대화형에서 사용자가 승인하는 흐름은 확인하지 않았음
