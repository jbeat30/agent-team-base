# Relay mode (PM procedure)

Read this only when the profile's `Execution profile` is full and `Execution mode` is relay (or missing or `unchecked`).

In full with relay mode, the leader does not use the Agent tool and only returns call cards. The guard rejects the leader's Agent calls.
The PM executes the card's call order, allowed files, and completion criteria IDs exactly. Do not summarize or rewrite cards or widen the scope.

- G1: PM calls planner-agent and architecture-agent (for L3, also qa-agent in plan mode) directly and receives the originals in `reports/`, then calls planning-lead with the original paths to write `plan.md`. If planning-lead requests more analysis it returns `needs-dispatch` with cards, so the PM makes those calls and calls planning-lead again with the report paths.
- G3: When dev-lead is called it returns the confirmed plan's sequential cards as `needs-dispatch`. The PM calls one worker at a time, passes the report path back to dev-lead, and receives the next card or the consolidated report in `reports/dev-lead.md`.
- Save every card the PM uses for a call exactly as called, before the call, to `.claude-team-docs/runs/<runId>/cards/NN-<receiving role>.md` (the same for direct PM calls in lite and nested). NN in the file name is the call sequence number.
- If a card conflicts with the plan (allowed files, requirement IDs, or source mismatch), do not call. Ask dev-lead or planning-lead for a corrected card.
- If a report says the leader's Agent call was rejected for the relay mode reason, do not work around it. Report it to the user.
