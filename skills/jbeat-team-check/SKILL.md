---
name: jbeat-team-check
description: |
  Check the Jbeat agent team installation in the current project without calling Claude (no token cost).
  Runs the bundled static verify and reports pass, fail, and unverified items.
  Triggers: jbeat team check, check agent team, verify agent team, 팀 설치 확인, 팀 점검
argument-hint: "(no argument needed)"
user-invocable: true
allowed-tools:
  - Bash
---

# Jbeat Team Check

1. `node "${CLAUDE_PLUGIN_ROOT}/scripts/install.mjs" verify --target .` 실행, `--live`는 붙이지 않음(Claude 호출 없음)
2. 결과의 `fail`, `unverified`를 그대로 요약 보고, 설치되지 않았으면 `/jbeat-team-setup` 안내
3. 보호 장치 실동작 확인은 `--live`가 필요하며 Claude를 한 번 호출한다고 알리고 사용자가 원할 때만 실행
