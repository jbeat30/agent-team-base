---
name: setup
description: |
  Set up, update, or remove the Claude Team Base agent team (Lite or Full) in the current project.
  Runs the bundled deterministic installer, shows a short plan, asks for one confirmation, and verifies the guard.
  Triggers: set up agent team, install agent team, update agent team, remove agent team, claude team base setup, 에이전트 팀 세팅, 팀 설치, 팀 갱신, 팀 제거
argument-hint: "[install | update | remove]"
user-invocable: true
allowed-tools:
  - Read
  - Bash
  - Glob
  - Write
  - AskUserQuestion
---

# Claude Team Base Setup

The installer ships inside the plugin, so no repository fetch is needed.
`<installer>` = `node "${CLAUDE_PLUGIN_ROOT}/scripts/install.mjs"`
If `${CLAUDE_PLUGIN_ROOT}` is empty, find it with `find ~/.claude -path "*agent-team-base*/scripts/install.mjs" | head -1`.

## Steps

1. Decide the action from the argument or the request: install (default), update, or remove.
2. Read `${CLAUDE_PLUGIN_ROOT}/INSTALL.md` and follow the matching sections. Skip section 1 (fetching).
   - install: sections 2 to 8
   - update: section 10
   - remove: section 9
3. Save tokens: read only the needed sections, and do not ask what `detect` already tells you.
4. Talk with the user in their language. Installer output is English; show it translated.

## Usage mode

Do not ask for a mode at install. Every role file is installed and the team starts in Lite. Say in one line that the default mode (Lite or Full) and the MCP servers can be changed later with `/agent-team-base:setting`, and that a single request can ask for Full ("handle this in Full mode").

## Rules

- Apply the "Rules to always follow" of INSTALL.md as written. This skill is an entry point and never widens permissions.
- Never change global settings or other plugins; stay inside the current project.
- Report checks you could not run as `unchecked`.
