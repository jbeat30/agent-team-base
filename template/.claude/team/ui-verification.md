# UI verification method

Read this when verifying UI (planner, frontend, qa, and the PM at G2). The project decides how its UI is verified; the team never imposes its own method on a target the project has a method for. Do not assume one method fits a whole project: the method can differ by screen, component, or kind of change.

## Decide per target

A target is one screen, component, or change that needs UI verification. For each target:

1. Re-read the files listed under `Project rule sources` in `.claude/team/profile.md` from their original paths, and search them for statements about how UI is verified (any method: measured styles, a design-tool value comparison, a browser or test tool, a story or snapshot, a manual checklist, or something else). Rules may be scoped by path, screen, component, or change type; match the rule to the target.
2. Put the target in exactly one case:
   - **Defined**: one clear method applies to this target, including any tolerance or criterion it states (for example a pixel tolerance). A clear method that you cannot run yourself is still Defined; handle it under "When the method cannot be run by the role".
   - **Ambiguous**: the rule is vague, covers only part of the target, conflicts with another rule, has an unclear scope, or names a method you cannot map to a tool or command.
   - **None**: no rule about UI verification applies to this target.

## Act by case

- **Defined**: use that method as written, with its criterion. Do not replace it or add the team's own method on top. Use the team's browser check only for a gap the method does not cover, and only after the user agrees.
- **Ambiguous**: ask the user; never guess and never choose the closest-looking method. Quote the rule text and its file, and list the options. Planner and QA return `needs-input` with the question; the PM asks at G2. Until answered, that target is `unchecked`.
- **None**: use the team default: compare with the design system or design source when there is one, and look at the running app with a browser tool the profile lists. Say in the report that no project method was found and that the team default was used. A single snapshot or screenshot per target is a look; anything multi-step (a scripted walkthrough) still needs the user's consent (`design-tools.md`).

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
| measured | A method was actually run (the project's method, or the team default when the project has none) and its output or record is cited; state which method |
| read-only | Judged from reading code, styles, or design values without running the method |
| unchecked | Not verified, with the reason |

If the project's method requires measuring (for example exact values), a `read-only` result does not satisfy it: report that criterion as unverified. Never present `read-only` as `measured`.

## Record and confirm

- The PM records this in plan section 7 from the planner's report (other roles report it and do not edit the plan): for each UI requirement ID write the method, its source (rule file and line, or `none found`), and its case (Defined, Ambiguous resolved by the user, or None). Escape any `|` in a table cell as `|`.
- At G2, show the user the chosen method per target in one short table (target, method, source) so a wrong guess is caught before work starts.
- The plan is the record. Only if the user asks to keep it, suggest they add the line to their own rule file; do not edit the project's rule files or the profile yourself.
- Interaction safety is unchanged: no real credentials, orders, payments, messages, or data changes, and a UI/UX walkthrough still needs consent.

## `unchecked` is not an ending

An `unchecked` target that the user can resolve (an ambiguous rule, a missing link or value, a tool or environment only the user has, a request you could not understand) is a question for the user. Never close a run with such items only listed as `unchecked`.

- **Stop and ask at once** when the answer could change what is built or what is already built, that is, when it could force changing or redoing finished work instead of only adding to it. Stop the affected work where the unknown appears, even in the middle of a run. The role returns `needs-input` with the question and what it has done so far; the PM asks the user right away and resumes after the answer. When unsure which kind it is, treat it as this kind and ask first, because redoing work costs the user's tokens.
- **Continue and ask at the end** only when every possible answer would just add work (one more check, one more result to attach) and none could change finished work. Say so in the question: the answer adds a check and nothing done changes.
- Put the open items to the user in one message: only the unresolved items, the quoted rule or request, the options, and for each option whether it adds work or changes finished work. Do not ask what the rule files or the profile already answer.
- After the answer, keep the finished work and redo only the parts it affects.
- The final report lists items still open as questions awaiting the user's answer, not as a result.
