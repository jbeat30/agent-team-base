---
name: check
description: |
  Check the Claude Team Base installation in the current project without calling Claude (no token cost).
  Runs the bundled static verify and reports pass, fail, and unchecked items.
  Triggers: check agent team, verify agent team installation, claude team base check, 팀 설치 확인, 팀 점검
argument-hint: "(no argument needed)"
user-invocable: true
allowed-tools:
  - Bash
---

# Claude Team Base Check

1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/install.mjs" verify --target .` without `--live` (no Claude call).
2. Summarize `fail` and `unverified` from the result in the user's language. If nothing is installed, point to `/claude-team-base:setup`.
3. Checking that the guard really fires needs `--live`, which calls Claude once. Say so and run it only when the user asks.
