# v0.3.2 점검 결과

변경: 설치 때 모드를 묻지 않고(항상 전체 역할 설치, 기본 Lite, 가드 relay 보호 상시), 설치 후 `/claude-team-base:setting`과 설치기 `config` 명령으로 기본 모드 전환과 MCP 추가
조건별 1회씩의 동작 점검이며 효용 평가가 아님, 비대화형 실행(`claude -p`), 한 모델(sonnet), 작은 합성 fixture
앞선 점검: [EVAL_RESULTS_v0.3.0.md](EVAL_RESULTS_v0.3.0.md)

## 점검 결과

| 점검 | 기대 | 결과 |
| --- | --- | --- |
| 설치 때 모드를 생략 | 기본 Lite, 실행 모드 relay로 기록 | 프로필에 `Execution profile: lite`, `Execution mode: relay` |
| Lite로 설치한 프로젝트에서 `/team 이번 요청은 Full 모드로 처리해줘 …` | Full 경로 실행 | planning-lead → dev-lead → backend → test → qa 순서로 호출, 프로필의 기본값(lite)은 그대로 두고 불일치를 보고, 0.80달러 |
| `/claude-team-base:setting` | 현재 설정과 MCP 선택 현황 표시 | 기본 모드, 보호 모드, MCP 5종의 용도·사용 역할·선택 여부·주의 사항을 표로 표시(0.05달러) |
| `/claude-team-base:setting`으로 모드 전환과 MCP 추가 | 미리보기 후 적용, 설치 검증 유지 | `config` 미리보기 → `--yes` 적용, 프로필 `full`, Figma 추가(`.mcp.json`·프로필·매니페스트 갱신), `verify` ok(0.06달러) |

## 점검 중 발견해 고친 문제

- Full 경로의 마지막 요구 보존 검사(`trace`)가 실패했음. planning-lead 호출 카드의 허용 파일에 계획서(`plan.md`)가 적혀 있는데 검사가 이를 "변경 계획 6장에 없는 소스 파일"로 판정했기 때문임
- 실행 기록 폴더(`.claude-team-docs/runs/`) 안의 파일은 소스 파일 비교에서 제외하도록 수정하고, 계획에 없는 소스 파일은 계속 탐지하는 테스트를 추가함
- 이 수정 후 Full 경로를 다시 실행해 `trace` 통과를 확인하지는 못함(단위 테스트로만 확인)

## 한계

- 조건별 1회, 비대화형 실행. 스킬이 사용자에게 묻는 AskUserQuestion 화면은 거치지 않았고, 요청문에 승인을 미리 적어 미리보기 후 바로 적용하게 했음
- Lite로 설치한 프로젝트에서 Full을 요청한 실행은 지침이 요청을 따르도록 쓰여 있고 1회 따랐다는 확인일 뿐, 항상 따른다는 보장이 아님
- 가드의 relay 보호는 Lite 설치에서도 `Execution mode: relay` 기록으로 켜지게 했으나 실제로 막는 장면은 이번 점검에서 따로 관찰하지 않음
- 마켓플레이스 캐시 경로에서 새 스킬과 `config` 명령이 로드되는지는 릴리즈 후에 확인해야 함
