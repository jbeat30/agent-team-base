# UI verification method

Read this when verifying UI (planner, frontend, qa, and the PM at G2). The project decides how its UI is verified; the team never imposes its own method on a target the project has a method for. Do not assume one method fits a whole project: the method can differ by screen, component, or kind of change.

## Decide per target

A target is one screen, component, or change that needs UI verification. For each target:

1. Re-read the files listed under `Project rule sources` in `.claude/team/profile.md` from their original paths, and search them for statements about how UI is verified (any method: measured styles, a design-tool value comparison, a browser or test tool, a story or snapshot, a manual checklist, or something else). Rules may be scoped by path, screen, component, or change type; match the rule to the target.
2. Put the target in exactly one case:
   - **Defined**: one clear method applies to this target, including any tolerance or criterion it states (for example a pixel tolerance).
   - **Ambiguous**: the rule is vague, covers only part of the target, conflicts with another rule, has an unclear scope, or names a method you cannot map to a tool or command.
   - **None**: no rule about UI verification applies to this target.

## Act by case

- **Defined**: use that method as written, with its criterion. Do not replace it or add the team's own method on top. Use the team's browser check only for a gap the method does not cover, and only after the user agrees.
- **Ambiguous**: ask the user; never guess and never choose the closest-looking method. Quote the rule text and its file, and list the options. Planner and QA return `needs-input` with the question; the PM asks at G2. Until answered, that target is `unchecked`.
- **None**: use the team default: compare with the design system or design source when there is one, and look at the running app with a browser tool the profile lists. Say in the report that no project method was found and that the team default was used. A scripted walkthrough still needs the user's consent (`design-tools.md`).

Do not build a list of known methods and pick from it. Read the method from the rule text, then check what is available to run it.

## When the method cannot be run by the role

The method may need a command (roles have no shell), a tool the role does not have, or the user's own environment. Never block the work, and never silently replace the method with a different one.

1. If it is a command, list it in plan section 8; the PM runs it with the check runner and passes the record path.
2. If it needs a tool or MCP server, check the profile and the role's tools. If the PM's session has the tool, the PM runs it and passes the result. Otherwise ask the user to run it or to say how to proceed.
3. Until a result exists, record the target as `unchecked` with the missing prerequisite. Do not report it as passed.

## Evidence grade

Label every UI claim in the report with one grade.

| Grade | Meaning |
| --- | --- |
| measured | The defined method was run and its output or record is cited |
| read-only | Judged from reading code, styles, or design values without running the method |
| unchecked | Not verified, with the reason |

If the project's method requires measuring (for example exact values), a `read-only` result does not satisfy it: report that criterion as unverified. Never present `read-only` as `measured`.

## Record and confirm

- In plan section 7, write for each UI requirement ID the method, its source (rule file and line, or `none found`), and its case (Defined, Ambiguous resolved by the user, or None).
- At G2, show the user the chosen method per target in one short table (target, method, source) so a wrong guess is caught before work starts.
- The plan is the record. Only if the user asks to keep it, suggest they add the line to their own rule file; do not edit the project's rule files or the profile yourself.
- Interaction safety is unchanged: no real credentials, orders, payments, messages, or data changes, and a UI/UX walkthrough still needs consent.
