# Work card

Common form for internal handoff between agents, never used in conversation with the user.
Pass it as the prompt body of a call.
Save it right before the call to `.claude-team-docs/runs/<runId>/cards/NN-<receiving role>.md`; `team-check.mjs trace` compares it with the plan.
Use file paths as the single source of truth, not summaries. If the card and the files differ, the receiver stops and reports the difference.

- runId:
- Request source path: `.claude-team-docs/runs/<runId>/request.md`
- Plan path and hash: `.claude-team-docs/runs/<runId>/plan.md`, hash
- Mode: if applicable plan | final
- Goal:
- Allowed files (exact paths):
- Forbidden files and areas:
- Assigned requirements and completion criteria IDs:
- Order and dependencies: prior work and output paths
- Output path: if applicable
- Evidence paths: if applicable, prior reports, check records, diff paths
- On rework: failed items and round number (limit 3)

## Request source

> Attach the request source from request.md verbatim
