---
name: jbeat-team-setup
description: |
  Set up, update, or remove the Jbeat agent team (Lite or Full) in the current project.
  Runs the bundled deterministic installer, shows a short plan, asks for one confirmation, and verifies the guard.
  Triggers: jbeat team setup, set up agent team, install agent team, update agent team, remove agent team, 에이전트 팀 세팅, 팀 설치, 팀 갱신, 팀 제거
argument-hint: "[install | update | remove]"
user-invocable: true
allowed-tools:
  - Read
  - Bash
  - Glob
  - Write
  - AskUserQuestion
---

# Jbeat Team Setup

설치기는 플러그인에 포함되어 있어 저장소를 따로 가져오지 않음
`<설치기>` = `node "${CLAUDE_PLUGIN_ROOT}/scripts/install.mjs"`
`${CLAUDE_PLUGIN_ROOT}`가 비어 있으면 `find ~/.claude -path "*jbeat-team-base*/scripts/install.mjs" | head -1`로 찾음

## 절차

1. 인자 또는 요청에서 동작 결정: install(기본), update, remove
2. `${CLAUDE_PLUGIN_ROOT}/INSTALL.md`를 읽고 해당 장을 따름, 1장(가져오기)은 건너뜀
   - install: 2~8장
   - update: 10장
   - remove: 9장
3. 토큰 절약: 필요한 장만 읽고, 감지 결과(`detect`)로 알 수 있는 질문은 하지 않음

## 사용 모드 선택 기준

질문 시 아래를 한 줄로 안내하고 사용자가 고르게 함

| 모드 | 적합한 요청 | 동작 |
| --- | --- | --- |
| Lite (기본 권장) | 작은 수정부터 중간 규모 기능 | PM이 필요한 역할만 직접 호출, 단순 요청은 직접 처리 |
| Full | 여러 영역에 걸친 큰 작업 | 기획·개발 리더가 하위 역할을 조율, PM이 호출 카드로 호출(relay) |

두 모드 모두 단순 요청은 팀을 호출하지 않고 PM이 직접 처리하는 등급 분류를 사용

## 규칙

- INSTALL.md의 "항상 지킬 규칙"을 그대로 적용, 이 스킬은 절차 진입점이며 권한을 넓히지 않음
- 전역 설정·다른 플러그인 변경 금지, 대상은 현재 프로젝트 내부로 한정
- 실행하지 못한 확인은 `미확인`으로 보고
