<h1 align="center">claude-team-base</h1>

<p align="center">
  <img src="docs/assets/hero.en.png" alt="claude-team-base: a Claude Code agent team that respects your project's rules" width="100%">
</p>

<p align="center">
  <a href="https://github.com/jbeat30/claude-team-base/actions/workflows/ci.yml"><img src="https://github.com/jbeat30/claude-team-base/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/status-experimental-orange" alt="status: experimental">
  <img src="https://img.shields.io/badge/Claude%20Code-%E2%89%A5%202.1.302-5A67D8" alt="Claude Code 2.1.302 or later">
  <img src="https://img.shields.io/badge/Node-%E2%89%A5%2018-339933" alt="Node 18 or later">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT"></a>
</p>

<p align="center"><a href="README.md">한국어</a></p>

A Claude Code agent team that respects your project's existing rules and tools. A main-session PM, specialist agents, and an independent QA work through stage gates.
Requirement coverage, discovery of missed items, scope control, evidence, and finishing quality come before speed.

> **Preparing experimental v0.1.0; no installable release tag yet** · See [Status](#status) for what has and has not been verified
> No performance or quality improvement is claimed until it is demonstrated by evaluation

> The quick start below is for a tagged release. INSTALL.md stops installation when no release tag exists.

## Quick start

Open Claude Code in your project and send one line:

```text
Read INSTALL.md at https://github.com/jbeat30/claude-team-base and set this project up
```

![Install flow: from one line to natural-language use](docs/assets/install-flow.en.png)

- Claude reads [INSTALL.md](INSTALL.md), pins a release tag, fetches it, and inspects your project
- It asks only what it needs, in chat: Lite or Full, Context7 MCP registration, protected areas, and corrections to what it detected
- It shows the change plan in ten lines or fewer and asks for **one final setup confirmation** (missing information, conflicts, or failures may need separate questions)
- An installer script copies and merges files deterministically, then checks the guard with a real Claude call
- Requirements: Claude Code 2.1.302 or later, Node 18 or later
- Existing files are never overwritten, and global settings and feature code are not changed. You can remove it at any time

After setup, start a new session and ask in plain language:

```text
Add a password visibility toggle to the existing login screen. Follow our UI rules.
```

```text
Add delivery status to the order API and connect it to the screen. Start with the contract and impact.
```

```text
Explain what this function does.
```

## How it works

### The agent team

![Agent team: Lite and Full](docs/assets/agent-team.en.png)

The main session acts as the PM (`pm-agent`), talks with you, and calls only the roles it needs.
All ten role files are always installed. **Lite or Full is a usage mode you choose at setup.**

| Mode | Structure | Fits |
| --- | --- | --- |
| Lite | The PM calls analysts, specialists, and QA directly | General work |
| Full | A planning lead and a development lead coordinate their specialists; the PM calls QA directly | Multi-area, large, or high-risk work |

| Role | Responsibility |
| --- | --- |
| pm-agent (main session) | Triage, conversation and confirmation, approved scope, check execution, final report |
| planning-lead · dev-lead | Full only: coordinate planning · coordinate implementation |
| planner-agent | Requirement breakdown, items you may have missed, acceptance criteria |
| architecture-agent | Callers, contracts, regression, and side-effect analysis |
| frontend · backend · api · test | Edit only assigned files, write tests |
| qa-agent | Plan review; independent review of changes, check records, and the completion checklist |

### Workflow

![Workflow: from intake to the final report](docs/assets/task-workflow.en.png)

| Level | Example | Path |
| --- | --- | --- |
| Q | Questions and explanations | The PM answers directly |
| L1 | Comments, typos, wording; behavior unchanged | The PM edits directly and runs a completion check |
| L2 | General behavior changes | Plan → confirm → build → final verification |
| L3 | Contracts, permissions, data, security, many areas | L2 path with mandatory impact analysis and user confirmation |

- **Requirements become Given/When/Then acceptance criteria**; where tests are possible, failing tests are written first
- **Every agent reads the original request and the plan file directly**, so requirements do not drift through summaries
- Scope changes, policy decisions, compatibility changes, security, and external effects are confirmed with you first; otherwise the PM confirms and says so
- No source edits before confirmation; failed verification returns to development, at most three rework rounds
- Approved commands only are run by the **check runner**, which records exit code, timestamps, output, and hashes; QA reads those originals instead of the PM's summary
- Library and framework behavior is checked against the installed version through Context7; anything unchecked is marked `unverified`

## What gets installed

```text
.claude/
  agents/        ten role definitions
  hooks/         guard hook
  team/          forms, project profile, check runner, install manifest
  settings.json  agent=pm-agent and hook registration (merged with your settings)
.claude-team-docs/   per-task records (request, plan, reports, check records, diff); optional .gitignore entry
.mcp.json            Context7 registration (optional, merged with your settings)
```

## Safeguards and limits

- **Guard hook (advisory mode)**: checks per-role write paths, source writes only after the plan is confirmed, assigned files only, leads' call targets, and sequential writer execution; it blocks on errors
- **A safeguard against mistakes, not a security boundary**: it does not stop shell commands from the main session or changes to user or hook settings
- Check records come from a runner executed by the main session and are not fully tamper-proof; QA reports state the source
- Right after install the guard is checked with a real Claude call; if that is not confirmed, treat it as no protection
- Report vulnerabilities privately through [SECURITY.md](SECURITY.md)

## Status

| Area | Details |
| --- | --- |
| Existing verification record | Temporary projects with Claude Code 2.1.302 (Windows, non-interactive): Lite and Full flows, guard firing and blocking, install, verify, and removal. Separate from interactive manual checks |
| Automated checks | [PR #4 CI](https://github.com/jbeat30/claude-team-base/actions/runs/39152624814), commit `09b6136`: static checks and 31 unit tests pass on Ubuntu and Windows (Node 20). The fix is included in the feature baseline; the README branch also passes all 31 tests locally on Windows (Node 24) |
| Additional local checks | 47 automated tests passed on Windows (Node 24), including strict mode and the target-directory fix. Remote CI for these changes is pending |
| Unverified | Approval flow and workspace trust in interactive sessions, actual Claude runs on non-Windows OSes, repeated evaluation (performance, delegation accuracy), real use of Context7, interactive Q/L1/L2/L3 scenarios on the final integration commit, execution on the minimum Node 18 version |
| Implementation under verification | Optional strict mode records direct approval, registers scoped plans, and checks hashes. Automated regression tests do not establish interactive Claude behavior. See the [procedure and limits (Korean)](template/.claude/team/strict-mode.md) |
| Remaining for v0.1.0 | Relay mode, real-environment verification, and repeated behavioral evaluation |
| Planned for v0.2.0 | Standalone and integrated bkit PDCA. v0.1.0 setup accepts off only; native planning and verification gates remain active |

### Manual checks before release

Install the final integration commit into a fresh temporary project and check at least one Q, L1, L2, and L3 request

| Scenario | Expected evidence |
| --- | --- |
| Q · Explain a function | No file changes, delegation, or PDCA |
| L1 · Single-file typo | Main-session edit, only the intended file changed, lightweight completion check |
| L2 · Behavior change | Plan → confirm → build → independent QA, original check records and diff match the report |
| L3 · API contract change | Impact analysis and user confirmation before source edits, followed by gates and verification |

Check L2/L3 routes in both Lite and Full, plus denied approval, guard rejection, check failure, preservation of existing settings, and removal
Record the commit, environment, profile, request, approvals, calls, diff, and check records. Four successes do not establish safety in every environment
Keep unchecked items unverified. Block release if source changes before required approval or out-of-scope writes are allowed

## Removal and updates

Ask Claude the same way you installed. It fetches the installer again at the tag recorded in the install manifest.

```text
Read INSTALL.md at https://github.com/jbeat30/claude-team-base and remove it from this project
```

```text
Read INSTALL.md at https://github.com/jbeat30/claude-team-base and update this project to the latest version
```

- Removal: shows a preview, then removes only what was installed after you confirm; files you edited since install are kept, and task records (`.claude-team-docs`) and backups are not deleted
- Update: shows the differences between the new tag and your installation as a plan before applying; files you edited are never overwritten automatically and are reported as conflicts

## Contributing

Issues and fork PRs are welcome. Only the owner has write access; every change is reviewed and merged by the owner.

- Bugs and feature ideas: [Issues](https://github.com/jbeat30/claude-team-base/issues/new/choose)
- Changes: fork and open a PR against the `feature/vX.Y.Z` branch the owner designates
- `main`, `release`, and `feature` branches require PRs and forbid force pushes; outside contributors cannot push or merge directly
- Fork PR workflows from all external contributors require maintainer approval, regardless of contribution history
- Development needs Node 18 or later; run `npm test` for static checks and unit tests
- Details (in Korean): [Contributing](.github/CONTRIBUTING.md) · [Branch strategy](.github/BRANCH_STRATEGY.md) · [Development rules](AGENTS.md)

## License

[MIT](LICENSE) · Copyright (c) 2026 jbeat
