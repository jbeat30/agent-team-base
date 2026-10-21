# Completion checklist

Common form. Complete project items from `profile.md` evidence and never add items by guessing.
qa-agent returns `pass` / `fail` / `n.a.` with evidence per item.
The light L1 checklist is limited to items marked `L1`.

| Item | How to check | L1 |
| --- | --- | --- |
| Each requirement ID is met | Compare plan completion criteria with the diff and check records | L1 |
| No changes outside allowed files | Compare changed file list with allowed files | L1 |
| Callers and impact checked | Compare the plan's impact list with the diff | |
| Errors, empty states, boundary values handled | Check code and tests where applicable | |
| Types, lint, format | Only when a record of the project-defined command exists | |
| Tests added or changed, with run record | Check the original check record | |
| Accessibility, wording, i18n | Check when the UI changed | L1 |
| Design system followed (tokens, components, naming) | Compare the diff with the profile's Design system entries; any value or component outside it fails | L1 |
| No leftover unused code, temporary logs, TODOs | Search the diff | L1 |
| Docs, comments, change log updated | Check when the project has a rule | |
| No secrets or sensitive data exposed | Check the diff | |
| No dependency or config change, or approved | Compare changed files with the approval record | |
| Unverified items stated | Check `unverified` in the report | L1 |

## Project-specific items

Add only items that have project evidence at install time (existing rules, check tools).

| Item | How to check | Evidence path |
| --- | --- | --- |
