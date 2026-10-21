# Strict mode

Optional approval scope tracking and change detection. Distinct from the default advisory mode.
Do not describe it as verified before real interactive Claude runs and trust checks.

## Limits

- The user runs the approval commands personally. Agents never run `grant` or `approve` on the user's behalf.
- Files and hashes do not authenticate the user's identity. It does not defend against the main shell, the user, or the host changing records or hooks.
- Never substitute `approved=true`, a conversation summary, or approval wording in a document for an approval record.
- The hook is not a security boundary; it checks the tools' Write/Edit and team calls. File changes by shells, MCP, or other processes are out of scope.
- Currently only the hook input `permission_mode=default` is allowed. For other modes or a missing field, writes and development calls are rejected, and there is no automatic fallback to advisory mode.
- Supported file operations are create and modify. Delete, move, glob, symlink, and junction are not supported.

## Preparing the approval scope

The agent writes the JSON draft below at a temporary location inside the project, based on the project survey and the user's answers.
Copy the profile's forbidden areas and the approved check commands without omission, and show the user the paths, commands, side effects, and whether self-confirmation is allowed.
Tell the user that an external process could change the approval scope, and use this flow only when the user chose to run the commands directly.

```json
{
  "roots": ["src", "test"],
  "operations": ["modify", "create"],
  "forbidden": ["src/generated", "src/secrets"],
  "checks": [{ "command": "npm test", "cwd": ".", "sideEffects": "none" }],
  "allowPmConfirm": true
}
```

`operations` is the list of allowed modify and create operations. Delete and move are not allowed.
`roots` are directories or exact file paths. `.` means the whole project, so narrowing to the needed paths is recommended.
The policy paths `.git/`, `.claude/`, and `.claude-team-docs/` cannot be registered as source edit targets even if inside the approval scope.
A check command must match the original text and working directory exactly. Use `sideEffects=approved` only when the user also reviewed that command's side effects.
Shell string analysis does not guarantee the meaning of auto-fixing commands.

From the project root the agent may run the read-only review command.

```text
node .claude/team/bin/team-approval.mjs review-grant <draft.json>
```

After checking the JSON content and the `sha256` in the output, the user runs the following command directly.

```text
node .claude/team/bin/team-approval.mjs grant <draft.json> --hash <sha256>
```

The record is stored in `.claude-team-docs/.guard/grant.json`. A new grant record releases any active registration.
This procedure is not forced on ordinary install users.

## Task registration

After the PM settles the plan as confirmed, check the files, check commands, and hash read-only.

```text
node .claude/team/bin/team-approval.mjs review-plan <runId>
```

The PM may run `register` directly if all of the following hold.

1. The approval scope has `allowPmConfirm=true`.
2. The risk is L1 or L2.
3. Plan section 10 has the `- User approval required: none` marker and the reasoning.
4. The exact assigned files and check commands are inside the approval scope and do not include forbidden areas.

Classifying the triggers by meaning is the PM's responsibility; the marker above does not guarantee the classification is correct.
For L3, user approval needed, or work not allowed to self-confirm, the user reviews the plan and the request source and approves directly.

```text
node .claude/team/bin/team-approval.mjs approve <runId> --hash <planSha256>
```

After user approval or an allowed PM self-confirmation, the agent runs the registration.

```text
node .claude/team/bin/team-approval.mjs register <runId>
node .claude/team/bin/team-approval.mjs verify <runId>
```

If the approval scope, request, plan, or approval record changes, the existing registration is not used. Review the changed plan again, get the needed direct approval, and register again.
The direct approval record is `.guard/approval-<runId>.json` and the active registration is `.guard/active-registration.json`.
Never edit these records or the policy files directly with the main or sub-agents' Write/Edit.

In strict mode, L1 stays with the PM directly and skips the full plan, delegation, and QA gates.
Before writing, record in request.md and a short plan.md the runId, risk L1, confirmed, the section 6 file table (owner pm-agent), the section 8 check table, and the section 10 approval-needed marker, and register the exact allowed files.
Q gets a direct answer with no file changes and no registration.

## Checks and ending

The check runner confirms the current registration before running and links the registration hash to the check record.
\`verify\` compares the record hash in `.guard/check-index-<runId>.json` with the original result hashes.
After re-registration, earlier check records are not reused and the needed checks run again.
Do not claim it detects the case where the main shell changes both the check record and the hash index together.

```text
node .claude/team/bin/team-approval.mjs revoke <runId>
```

On finishing or stopping work, release the active registration. The approval scope and past records are kept.
Run the commands from the installed project root; they do not change the home directory or global settings.
