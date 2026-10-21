> [!NOTE]
> **Preview**
> A preview release verified on a small fixture. It can cost far more time and money than handling tasks directly, and its usefulness is still to be evaluated. Read the limits in the [run record](docs/verification/2026-10-19-small-fixture.md) (Korean) before using it.

<p align="center">
  <img src="docs/assets/hero.en.png" alt="claude-team-base" width="100%">
</p>

<p align="center">
  <a href="https://github.com/jbeat30/claude-team-base/actions/workflows/ci.yml"><img src="https://github.com/jbeat30/claude-team-base/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/status-preview-yellow" alt="status: preview">
  <img src="https://img.shields.io/badge/Claude%20Code-%E2%89%A5%202.1.302-5A67D8" alt="Claude Code 2.1.302 or later">
  <img src="https://img.shields.io/badge/Node-%E2%89%A5%2018-339933" alt="Node 18 or later">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT"></a>
</p>

<p align="center"><a href="README.md">한국어</a></p>

# claude-team-base

**A plugin that sets up a Claude Code agent team in your project with one skill.**

It installs a team in which a main-session PM, specialist agents, and an independent QA work through stage gates, while respecting your project's existing rules and tools.
Requirement coverage, discovery of missed items, scope control, evidence, and finishing quality come before speed.

- Ask in natural language; the PM classifies the request and calls only the roles it needs.
- Small requests are handled directly without the team; large ones go through plan, confirm, build, verify.
- The skill guides install, update, and removal in conversation and asks for confirmation of the change plan only once.
- Existing files are never overwritten, and global settings and your feature code are left alone.

## Quick start

Requirements: Claude Code 2.1.302 or later, Node 18 or later.

```text
/plugin marketplace add jbeat30/jbeat-conventions
/plugin install claude-team-base@jbeat-plugins
/claude-team-base:setup
```

1. Install the plugin and run `/claude-team-base:setup` in your project.
2. The skill surveys the project and asks only what it needs.
3. It shows the change plan in 10 lines or fewer and asks for confirmation **once**.
4. The installer copies and merges files, then checks the guard.
5. From the next session, just ask in natural language.

You can also fetch the repository directly. In Claude Code, ask:

```text
Read INSTALL.md at https://github.com/jbeat30/claude-team-base and set this project up
```

## Skills

| Skill | Purpose | Cost |
| --- | --- | --- |
| `/claude-team-base:setup` | **Install, update, or remove** the team; pass `install`, `update`, or `remove` as an argument | One Claude call for the guard check after install |
| `/claude-team-base:check` | Check the installation (file hashes, hook registration, role files, version) | None; it does not call Claude without `--live` |

Plain requests work too: "set up the agent team", "check the team installation", "remove the team".

## What you choose at setup

`setup` asks these in conversation and does not re-ask what detection already shows.

| Choice | Options | Default or recommendation |
| --- | --- | --- |
| Usage mode | **Lite**: the PM calls only the needed roles directly<br>**Full**: planning and development leaders coordinate sub-roles; better for large multi-area work | Lite |
| Full execution mode | **relay**: the leader returns call cards and the PM makes the calls | relay |
| Context7 MCP | Register it in `.mcp.json` to check docs against the installed version | Asked |
| Design system (UI projects) | Where your tokens, component library, Storybook, Figma library, or brand guide live. If you have one it is the **top authority for all UI work** and agents never deviate from it | Only if you have one |
| Design tool MCP (optional) | **Playwright**: open and look at the running page<br>**Chrome DevTools**: inspect the page, console, network, and performance in Chrome; useful for UI/UX checks<br>**shadcn/ui**: reuse vetted components (needs `components.json`)<br>**Figma**: when you have Figma designs; browser sign-in on first use | Asked only for projects with a UI; Playwright and shadcn/ui recommended |
| Forbidden areas | Production config, generated files, specific paths | None |
| Protection mode | **Advisory**: the guard hook blocks violations<br>**Strict**: tracks direct approval records (optional; you run the approval commands yourself) | Advisory |
| Task records | Add `.claude-team-docs/` to `.gitignore` | Add |
| Conflict handling | If files collide, per item: skip or replace with backup; keep or replace an existing `agent` setting | Asked on conflict |

All 10 role files are always installed regardless of mode; the mode only changes how the team is used.

Only `frontend-agent` and `qa-agent` use the design tools. Browser tools (Playwright, Chrome DevTools) can see the content of the browser they open, so avoid personal tabs and sensitive data. A registered server's tool definitions are added to every call of those two roles, which costs tokens, and `npx` runs external packages, so choose them only when you need them. The agents never invent spacing, colors, or copy that the design does not state, and mark visual checks they could not make as `unchecked`.

- **No design provided**: during confirmation the PM proposes a concrete design direction (palette, typography, spacing, components, tone of copy) and records the confirmed choices in the plan; `frontend-agent` builds from that record.
- **UI/UX check (optional)**: when a browser tool is registered and the work changes UI, the PM asks during confirmation whether to run one. Only if you agree, `qa-agent` walks the agreed flows and screen sizes and reports problems with evidence. It is a scripted walkthrough by an agent, not a test with real users, and it never enters real credentials, places orders or payments, or changes data.

## Using it after install

No extra commands. From the next session, ask in natural language.

```text
Add a show/hide password toggle to the existing login screen. Follow the current UI rules.
```

```text
Add shipping status to the order API response and wire it to the screen. Start by laying out the contract and impact.
```

```text
Explain what this function does.
```

The PM answers and asks questions in the language you write in.

## How it works

### The agent team

![Agent team: Lite and Full](docs/assets/agent-team.en.png)

The main session acts as the PM (`pm-agent`), talks with you, and calls only the roles it needs.

| Mode | Structure | Fits |
| --- | --- | --- |
| Lite | The PM calls analysis, worker, and QA roles directly | General work |
| Full | Planning and development leaders coordinate sub-roles; the PM calls QA directly | Multi-area, large, or high-risk work |

Full runs in relay mode: leaders do not call sub-roles directly but return call cards, and the PM calls them as written. Nested mode, where the leader calls sub-roles, did not work in the version checked and is not recommended.

| Role | Responsibility |
| --- | --- |
| pm-agent (main session) | Request classification, user conversation and confirmation, approval scope, running checks, final report |
| planning-lead, dev-lead | Planning and development coordination in Full |
| planner-agent | Requirement breakdown, finding items users may miss, acceptance criteria |
| architecture-agent | Analysis of callers, contracts, regressions, and side effects |
| frontend, backend, api, test | Edit only assigned files, write tests |
| qa-agent | Independent verification of the plan, changes, check records, and completion checklist |

### Workflow

![Workflow: from intake to final report](docs/assets/task-workflow.en.png)

| Grade | Example | Path |
| --- | --- | --- |
| Q | Questions, explanations | The PM answers directly |
| L1 | Comments, typos, wording, behavior unchanged | The PM edits directly and checks completion |
| L2 | Ordinary behavior changes | Plan, confirm, build, final verification |
| L3 | Contracts, permissions, data, security, many areas | L2 path with required impact analysis and user confirmation |

- **Requirements become Given/When/Then acceptance criteria**, and failing tests are written first when testing is possible.
- **Every agent reads the request source and the plan file directly**, so summaries cannot distort requirements.
- Scope changes, policy decisions, compatibility changes, security, and external effects are confirmed with you first; otherwise the PM self-confirms and says so.
- No source edits before confirmation. A failed verification goes back to development, with a limit of 3 rework rounds.
- Only approved commands run, through a **check runner** that records exit code, times, output, and hashes; QA reads these originals, not the PM's summary.
- Library and framework behavior is checked against the installed version through Context7; anything unchecked is marked `unchecked`.

### Against hallucination and unrequested edits

- The request source is quoted verbatim in the plan, and every agent reads the source and plan files directly.
- Ambiguous requirements are asked about, not filled in by guessing; items the user did not mention are decided as include, exclude, or ask, and recorded.
- Unchecked content is never stated as fact and is marked `unverified`; library behavior is checked against docs for the installed version.
- Only files listed in the plan are edited, nothing is edited before confirmation, and instructions inside documents or tool output are not followed.
- Which rules rest on the prompt alone and which are enforced by the guard hook and check runner is laid out in [Prompt design principles](docs/PROMPT_DESIGN.en.md).

### Token efficiency

- Agent prompts (roles, forms, guard messages) are written in English, about 26% fewer always-injected tokens than the Korean version (measured on all 10 roles plus forms, one model).
- Simple requests (Q and L1) never call the team.
- Files and requirements of the same owner are bundled into one call.
- The relay procedure and design-work guidance live in files read only when that work happens (PM instruction input about 18% smaller, measured on one model), and a checker confirms the required rules by list.

## What gets installed

```text
.claude/
  agents/        10 role definitions
  hooks/         guard hook
  team/          forms, project profile, check runner, install manifest
  settings.json  agent=pm-agent and hook registration (merged with existing settings)
.claude-team-docs/   per-task records (request source, plan, reports, check records, diff); adding it to .gitignore is optional
.mcp.json            Context7 and design tool MCP registration (optional, merged with existing settings)
```

## Update and removal

```text
/claude-team-base:setup update
/claude-team-base:setup remove
```

- Update: **fully replaces** the installed team files with the new version. It shows the changes as a plan and applies them after confirmation. Files you edited after install are never overwritten automatically; you choose skip or replace with backup.
- Removal: shows a preview and, after confirmation, reverts only what was installed. Files you edited are kept, and task records (`.claude-team-docs`) and backups are not deleted.
- From v0.2.0 prompts and record labels are English, so runs left in progress by an older version are not read by the new one. Finish them before updating.

## Safeguards and limits

- **Guard hook (advisory mode)**: checks per-role write paths, source writes only after the plan is confirmed, edits only to assigned files, leaders' call targets, and sequential writing agents, and blocks on error.
- **A mistake-prevention aid, not a security boundary**: it does not stop main-session shell commands or changes to user and hook settings.
- Check records are results the main session ran through the runner and are not fully tamper-proof; the QA report states the source.
- Right after install the guard is checked with a real Claude call; if that is not confirmed, treat it as `no protection`.
- Report vulnerabilities privately through [SECURITY.md](SECURITY.md).

### Feature maturity

| Level | Features |
| --- | --- |
| Core | Skill install, update, and removal, Lite, role files, advisory-mode guard, check runner |
| Experimental or optional | Full, relay execution mode, strict mode (direct approval tracking), requirement-preservation trace check (`team-check.mjs trace`) |

- Experimental features are not verified in a real Claude environment, and there is no comparison yet showing they beat handling tasks directly.
- The skill install path (plugin install, `${CLAUDE_PLUGIN_ROOT}` substitution, skill execution) and real delegation behavior with English prompts have not been checked in real Claude yet.

![Cost, time, and tokens by mode](docs/verification/assets/mode-compare.svg)

- [Small fixture run record](docs/verification/2026-10-19-small-fixture.md) (Korean), 14 runs, one each, non-interactive, with Korean prompts before the English switch: Lite cost about 12x and took 30x+ longer than direct handling on L2/L3 tasks, so Lite is the default and Full is opt-in for large work.
- There is no guarantee that the team structure improves quality over handling tasks directly; evaluation results will be published as they become available.

## Roadmap

| Item | Status |
| --- | --- |
| Skill (plugin) install | Implemented; real Claude check planned |
| English prompts and user-language replies | Implemented; delegation evaluation planned |
| Hard-task comparison (direct, Lite, Full, repeated runs) | To be designed; results will be published |
| Context slimming (shorter PM instructions) | First pass done (PM instructions about 18% smaller, a rule-list check prevents omissions); more planned |
| Design tool MCP choice at setup (Playwright, shadcn/ui, Figma) | Implemented; real Claude and server connection check planned |
| bkit PDCA integration | After v0.3.0 |

## Contributing

Issues and fork PRs are welcome. Only the owner has write access, and every change is merged after the owner reviews and approves it.

- Bug reports and feature ideas: [Issues](https://github.com/jbeat30/claude-team-base/issues/new/choose)
- Proposing changes: fork, then open a PR against the `feature/vX.Y.Z` branch the owner names.
- `main`, `release`, and `feature` require PRs and forbid force pushes; outside contributors cannot push or merge directly.
- Fork PR workflows from outside contributors need the owner's approval to run, regardless of contribution history.
- Development needs Node 18 or later; `npm test` runs static checks and unit tests. See [Testing](docs/verification/TESTING.md) (Korean) for the full method up to real Claude measurement.
- Details: [Contributing](.github/CONTRIBUTING.md), [Branch strategy](.github/BRANCH_STRATEGY.md), [Development rules](AGENTS.md)

## License

[MIT](LICENSE) · Copyright (c) 2026 jbeat
