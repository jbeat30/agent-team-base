# Plan

Common form, before automatic install and execution in the target project.
Copy it to the run directory `.claude-team-docs/runs/<runId>/plan.md` and fill it in.
G1 cannot pass if any of the 12 sections is empty.

- runId:
- Risk: L2 | L3
- Author: pm-agent
- Status: draft | confirmed

## 1. User request source

> Quote the request source verbatim, no summary or restatement

## 2. Requirements

| ID | Requirement | Source quote |
| --- | --- | --- |
| R1 | | |

## 3. Items the user did not mention

Decide per item: callers, edge cases, states, errors, accessibility, permissions, migration, wording, test candidates.

| Item | Category | Handling | Reason |
| --- | --- | --- | --- |
| | | include / exclude / ask user | |

For UI work also record the design direction here: its source (Figma link, user description, existing styles, or proposed and confirmed) and the concrete choices.

## 4. Assumptions

| Assumption | Evidence or `unchecked` |
| --- | --- |
| | |

## 5. Impact and side effects

Callers, shared modules, contracts, data, security, performance, regression risk.

## 6. Change plan

List allowed files as exact paths without globs. One owner per file.

| Order | File | New file | Work | Owner |
| --- | --- | --- | --- | --- |
| 1 | | | | |

- Forbidden areas:
- Writes run one owner at a time, in sequence.
- In the Work column write only `modify` or `create`; strict mode rejects other values.
- Put only the role name (for example backend-agent) in the Owner column; the guard checks per-file write permission with this table.
- Do not use the `|` character inside table cells (it is read as a column separator and the guard check fails); write `\|` if needed.

## 7. Completion criteria

Acceptance criteria and verification method per requirement ID. If automatic verification is impossible, state the manual procedure and the reason.

| ID | Given | When | Then | Verification |
| --- | --- | --- | --- | --- |
| R1 | | | | test / command / screen check |

UI/UX walkthrough (only if the user opted in at confirmation): flows, viewports, and pass criteria.

## 8. Check commands and side-effect class

| Command | Working directory | Side effects (auto-fix, external access, state change) |
| --- | --- | --- |
| | | none / present (separate approval) |

## 9. Completion checklist

Items applied from `.claude/team/checklist.md` plus project-specific items.

## 10. Items requiring user approval

- User approval required: none | required

If none, write `none` with the reasoning. If required, list items, options, and a recommendation.
In strict mode, PM self-registration is possible only when this marker is `none`, the risk is L1/L2, and the approval scope allows self-confirmation.

## 11. Evidence

File paths and lines, document URLs and versions. Mark items without evidence as `unchecked`.

## 12. Appendix

Reference paths and hashes of the original report files. Do not copy them in full.

- reports/planner-agent-01.md:
- reports/architecture-agent-01.md:
- reports/qa-plan.md:

## Confirmation record

- confirmedBy: user | pm-agent
- PM independent check: source comparison / verifiability of completion criteria / allowed file scope / approval trigger re-judgment / no unresolved findings
- Plan hash:
