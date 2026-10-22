<p align="center">
  <img src="docs/assets/hero.en.png" alt="claude-team-base" width="100%">
</p>

<p align="center">
  <a href="https://github.com/jbeat30/claude-team-base/actions/workflows/ci.yml"><img src="https://github.com/jbeat30/claude-team-base/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/release-v0.3.1-blue" alt="release: v0.3.1">
  <img src="https://img.shields.io/badge/Claude%20Code-%E2%89%A5%202.1.302-5A67D8" alt="Claude Code 2.1.302 or later">
  <img src="https://img.shields.io/badge/Node-%E2%89%A5%2018-339933" alt="Node 18 or later">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT"></a>
</p>

<p align="center"><a href="README.md">한국어</a></p>

# claude-team-base

**A plugin that sets up a Claude Code agent team in your project with one skill.**

It installs a team in which a PM, specialist agents, and an independent QA work through stage gates, while respecting your project's existing rules and tools.
Requirement coverage, discovery of missed items, scope control, evidence, and finishing quality come before speed.

- **The team works only when you call it.** Installing does not change your normal Claude conversations. Use `/team <request>` or say something like "solve this with the agent team", and the team handles just that request.
- When the team runs, the PM classifies the request: simple ones are handled directly, large ones go through plan, confirm, build, verify.
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
5. When you need the team, call it with `/team <request>`.

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
| Conflict handling | If files collide, per item: skip or replace with backup | Asked on conflict |

All 9 role files are always installed regardless of mode; the mode only changes how the team is used.

Only `frontend-agent` and `qa-agent` use the design tools. Browser tools (Playwright, Chrome DevTools) can see the content of the browser they open, so avoid personal tabs and sensitive data. A registered server's tool definitions are added to every call of those two roles, which costs tokens, and `npx` runs external packages, so choose them only when you need them. The agents never invent spacing, colors, or copy that the design does not state, and mark visual checks they could not make as `unchecked`.

- **No design provided**: during confirmation the PM proposes a concrete design direction (palette, typography, spacing, components, tone of copy) and records the confirmed choices in the plan; `frontend-agent` builds from that record.
- **UI/UX check (optional)**: when a browser tool is registered and the work changes UI, the PM asks during confirmation whether to run one. Only if you agree, `qa-agent` walks the agreed flows and screen sizes and reports problems with evidence. It is a scripted walkthrough by an agent, not a test with real users, and it never enters real credentials, places orders or payments, or changes data.

## Using it after install

The team starts only when you call it; otherwise you talk to Claude as usual.

![Ordinary requests versus calling the team](docs/assets/team-on-demand.en.png)

- `/team <request>`: starts the team for sure.
- In words: "solve this with the agent team" or "work on this as pm-agent" are recognized too (the model decides, so it can occasionally miss; use `/team` then. Claude may ask for permission to run the skill. In a non-interactive check the skill did not run without that permission; the interactive screen has not been checked).
- For a simple question or a small edit, asking Claude directly is faster and cheaper than calling the team.

```text
/team Add a show/hide password toggle to the existing login screen. Follow the current UI rules.
```

```text
Solve this with the agent team: add shipping status to the order API response and wire it to the screen. Start by laying out the contract and impact.
```

```text
Explain what this function does.
```

### When to call the team

| Call the team | Just ask directly |
| --- | --- |
| Changing a function's return shape or an API contract so several callers must change | Explaining code, questions |
| Adding a feature where unstated requirements (validation, error handling) are easy to miss | Typos, comments, wording |
| Changes to data structures, permissions, or security where the impact has to be worked out first | A small edit to a single file |

In the evaluation the team appeared to help on changes with hidden callers and on tasks with unstated requirements. There are too few repeated runs to be sure. Details are in the [results and limits](docs/verification/EVAL_RESULTS_v0.2.0.md) (Korean).

A request like the last one, without calling the team, is answered by regular Claude. The PM answers and asks questions in the language you write in.

## How it works

### The agent team

![Agent team: Lite and Full](docs/assets/agent-team.en.png)

When you call the team, the main session acts as the PM for that request, talks with you, and calls only the roles it needs (the PM instructions are the `/team` skill).

| Mode | Structure | Fits |
| --- | --- | --- |
| Lite | The PM calls analysis, worker, and QA roles directly | General work |
| Full | Planning and development leaders coordinate sub-roles; the PM calls QA directly | Multi-area, large, or high-risk work |

Full runs in relay mode: leaders do not call sub-roles directly but return call cards, and the PM calls them as written. Nested mode, where the leader calls sub-roles, did not work in the version checked and is not recommended.

| Role | Responsibility |
| --- | --- |
| PM (`/team` skill, main session) | Request classification, user conversation and confirmation, approval scope, running checks, final report |
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
| L2 | Ordinary behavior changes | With no risk signal the PM handles it directly and self-checks (no independent QA, no runner records); otherwise plan, confirm, build, final verification |
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

- When you do not call the team, the PM instructions are not added to the session; they are read only when `/team` runs.
- Agent prompts (roles, forms, guard messages) are written in English, about 26% fewer always-injected tokens than the Korean version (measured on all 10 roles plus forms, one model).
- Simple requests (Q and L1) never call the team.
- Files and requirements of the same owner are bundled into one call.
- The relay procedure and design-work guidance live in files read only when that work happens (PM instruction input about 18% smaller, measured on one model), and a checker confirms the required rules by list.

## What gets installed

```text
.claude/
  agents/        9 role definitions
  skills/team/   the /team skill (PM instructions), read only when called
  hooks/         guard hook
  team/          forms, project profile, check runner, install manifest
  settings.json  hook registration (merged with existing settings); the main session is not pinned to the PM
.claude-team-docs/   per-task records (request source, plan, reports, check records, diff); adding it to .gitignore is optional
.mcp.json            Context7 and design tool MCP registration (optional, merged with existing settings)
```

## Update and removal

```text
/claude-team-base:setup update
/claude-team-base:setup remove
```

- Update: **fully replaces** the installed team files with the new version. It shows the changes as a plan and applies them after confirmation. Files you edited after install are never overwritten automatically; you choose skip or replace with backup.
- Updating from v0.2.x or earlier releases the `agent=pm-agent` setting that version added, so the main session is no longer pinned to the PM, and deletes the unmodified legacy PM agent file (settings and files you changed are kept).
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

- Strict mode applies to every edit of the main session, so it can affect ordinary conversations where the team was not called. Limiting it to team runs is still to be done.
- Experimental features are not verified in a real Claude environment, and there is no comparison yet showing they beat handling tasks directly.
- **Following the L3 procedure depends on the prompt alone and is not enforced**: in the v0.2.0 evaluation the PM classified a request as L3 and still edited directly without a plan, impact analysis, or user confirmation. That may have been caused by the direct path of that version; this version removed it but did not measure again. Behavior in interactive use has not been checked.
- Marketplace install and the `/team` call were checked in real Claude. Interactive screens (the skill permission prompt, the trust screen), macOS/Linux, and updating between releases are not checked yet.

![Cost, time, and tokens by mode](docs/verification/assets/mode-compare.svg)

- [Small fixture run record](docs/verification/2026-10-19-small-fixture.md) (Korean), 14 runs, one each, non-interactive, with Korean prompts before the English switch: Lite cost about 12x and took 30x+ longer than direct handling on L2/L3 tasks, so Lite is the default and Full is opt-in for large work.
- [v0.3.0 check results](docs/verification/EVAL_RESULTS_v0.3.0.md) (Korean): a check of how `/team` is called and one run of the hard task l1; not a usefulness evaluation
- [v0.2.0 evaluation results](docs/verification/EVAL_RESULTS_v0.2.0.md) (Korean; 8 tasks, one run each, one model, raw JSON included): the team's value can only be judged on the hard tasks (hidden callers l1, implicit requirements m1), which have few measurements and one run each, so they cannot be judged against the design criteria. Easy tasks are not requests anyone would hand to a team, so their cost figures are not used as evidence of the team's usefulness.
- There is no guarantee that the team structure improves quality over handling tasks directly.

## Roadmap

| Item | Status |
| --- | --- |
| Skill (plugin) install and `/team` call | Implemented; marketplace install and `/team` checked once each in real Claude; interactive screens still to be checked |
| English prompts and user-language replies | Implemented; delegation evaluation planned |
| Hard-task comparison (direct, Lite, Full, repeated runs) | One run published; repeated runs not done |
| Context slimming (shorter PM instructions) | First pass done (PM instructions about 18% smaller, a rule-list check prevents omissions); more planned |
| Design tool MCP choice at setup (Playwright, shadcn/ui, Figma) | Implemented; real Claude and server connection check planned |
| bkit PDCA integration | Planned for v0.4.0 |

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
