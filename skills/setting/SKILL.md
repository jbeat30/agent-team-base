---
name: setting
description: |
  Show and change the Claude Team Base settings of the current project: the default mode (Lite or Full), the protection mode, and which MCP servers the team uses. Offers to add, switch, or remove an MCP server (including the Figma connection type).
  Triggers: team settings, change team mode, switch to full, switch to lite, which mcp, add mcp, claude team base setting, 팀 설정, 모드 변경, mcp 추가, mcp 선택
argument-hint: "[mode | mcp]"
user-invocable: true
allowed-tools:
  - Read
  - Bash
  - AskUserQuestion
---

# Claude Team Base Setting

`<installer>` = `node "${CLAUDE_PLUGIN_ROOT}/scripts/install.mjs"`
If `${CLAUDE_PLUGIN_ROOT}` is empty, find it with `find ~/.claude -path "*agent-team-base*/scripts/install.mjs" | head -1`.
This skill changes only the team's own files of the current project (`.claude/team/profile.md`, `.mcp.json`, the manifest). It never changes global settings or other plugins. The setup skill installs, updates, and removes; this skill adjusts what is installed.

## Steps

1. Run `<installer> config --target .` and show the result in the user's language:
   - **Default mode**: Lite or Full. Say that the mode is the default path only: a single request can still ask for the other mode ("handle this in Full mode").
   - **Protection mode**: advisory or strict, with one plain sentence from the table below. It can be changed here (step 2).
   - **MCP servers**: a table with each server's name, what it is for, who uses it, whether it is selected (`selected`) and registered in `.mcp.json` (`registered`), and its note. Mark a server with `differs: true` as "a different setting of yours exists, left unchanged". Figma has three connection types (`figma` remote server, `figma-desktop` desktop app server, `figma-plugin` official plugin); say that only one can be selected, and that `figma-plugin` is not installed by this tool (it has an `install_command` the user runs).
2. If the argument or the request names what to change, go straight to it. Otherwise ask with AskUserQuestion what to change: the default mode, the protection mode, adding or removing an MCP server, switching the Figma connection, or nothing.
3. Before applying, run the same command with `--set-mode lite|full`, `--set-protection advisory|strict`, `--add-mcp <name[,name]>`, and/or `--remove-mcp <name[,name]>` (design tools only; `context7` cannot be removed) **without** `--yes`. To switch the Figma connection, pass the old one in `--remove-mcp` and the new one in `--add-mcp` in the same call. It prints a preview. Show the preview, any `warnings`, and any `conflicts`, and ask for one confirmation. If `conflicts` is not empty, nothing is applied even with `--yes`; report the conflicts and stop.
   - For `--set-protection strict`, always show every item of `warnings` in plain words before asking: it applies immediately; every edit of the main session, including ordinary conversations without the team, is blocked until the user registers an approval; the user runs the `grant` and `approve` commands directly (prefix `!` in the prompt), and the agent never runs them; the agent only drafts the approval scope and the user checks the `review-grant` hash before running `grant` (steps in `.claude/team/strict-mode.md`); it is experimental, its interactive approval flow is unverified, and it is not a security boundary. Ask whether to proceed with that one confirmation.
   - Switching to `advisory` needs no warning; it removes the approval requirement at once.
4. After confirmation run it again with `--yes`. Report what changed and the backup folder.
5. After adding an MCP server, say that a new Claude Code session is needed to load it, that Claude asks once to approve project MCP servers, and show every item of `next` (the sign-in or setup steps, for example the Figma `/mcp` Authenticate step, the Figma desktop app setting, or the plugin install command the user runs) and the server's note (for example the browser-content warning). Say that a successful registration does not mean the connection works: it is unchecked until the user signs in and sees the server connected in `/mcp` (or `/plugin`). After removing a server, say that a registered entry the team did not create, or one changed after install, is left in `.mcp.json`.
6. Run `<installer> verify --target .` (no `--live`) and report only failures. If nothing is installed, point to `/agent-team-base:setup`.

## Plain explanations to give when asked

| Term | One-line explanation |
| --- | --- |
| Lite | The PM calls only the roles it needs, directly. The default. |
| Full | Planning and development leaders coordinate the sub-roles; the PM calls them from call cards (relay). For large work across several areas. |
| Advisory protection | The guard hook blocks a rule violation (a write outside the plan, a wrong call). It is a safety net against mistakes, not a security boundary. |
| Strict protection | Adds approval records: the user approves the allowed paths and commands directly. Experimental, and it applies to every edit of the main session, even without the team. Switch back to advisory here at any time. |
| Guard hook | A small script Claude Code runs before every file write and agent call in this project. It checks the confirmed plan, assigned files, and who may call whom, and blocks the call when a rule is broken. |

## Rules

- Never apply a change without the user's confirmation in this conversation. A preview is not approval.
- Add only the servers named in `config`'s list. Never invent other servers or commands. Never run a plugin install command yourself; show it to the user.
- Never edit `.mcp.json` or the profile by hand; use the installer so the manifest hashes stay consistent.
- Report what could not be done (conflicts, unparseable `.mcp.json`) as it is. Do not work around it.
