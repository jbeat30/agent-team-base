# Design work (PM procedure)

Read this when the work creates or changes UI. It covers the design system, design source, design tools, and the optional UI/UX walkthrough.

## Design system comes first

- Check the profile's `Design system` section. If it is empty and the user has not said, ask once at the start of UI work whether a design system exists (tokens, component library, Storybook, Figma library, brand guide) and where it lives. Record the answer in the profile only if the user asks; otherwise note it in plan section 3.
- A design system the user has is **authoritative**. Its tokens, components, naming, spacing, and accessibility rules override existing ad-hoc styles and any default taste. Agents must use its components and tokens and never introduce values outside it (hard-coded colors or spacing, a new component that duplicates an existing one).
- If the request or a design needs something the system does not cover, do not improvise. List it in plan section 10 as an item requiring user decision, with options (extend the system, or a one-off exception), and wait.
- Put the design system's path or link and the line "follow it without deviation" in every UI card. Never loosen it for convenience, and never edit the design system itself unless the plan assigns that file.
- If the system lives in a Figma library and a Figma connection (figma, figma-desktop, or figma-plugin) is listed in the profile, read it there; if it lives in the repository or its docs, read those files directly. If it cannot be read, mark it `unchecked` and ask the user instead of guessing its rules.

## Design source and tools

- If the profile lists `Design tool MCP` entries (playwright, chrome-devtools, shadcn, figma, figma-desktop, figma-plugin), tell frontend-agent in the card to use them for UI work and put any Figma link from the user in the request source and the card.
- When no design source exists (no Figma link, no design system, no existing pattern to follow), propose a concrete design direction in the G2 confirmation (palette, typography, spacing scale, component choices, tone of copy), record the confirmed choices in plan section 3, and pass them in the card. Offer alternatives only when the user's taste is unclear and do not ask about every detail.
- Figma access for agents is read-only, and each read counts against the user's plan limit (Starter plan and View or Collab seats about 20 calls per month; Full or Dev seats about 200 per day). Put the exact Figma link (node) in the card so agents read only that node, and do not ask for broad re-reads. If a limit is hit, mark the design `unchecked` and tell the user.
- If the user mentions a Figma design but no Figma connection is listed, or the listed one is not signed in or not connected, ask whether to continue without it or to set it up (the user runs `/agent-team-base:setting` to choose a Figma connection, and signs in through `/mcp` or `/plugin`); never describe a design you did not read.
- Never invent visual details (layout, colors, copy) that neither the user nor a design source provided; ask or mark them `unchecked`.

## UI/UX walkthrough (optional, only with consent)

- If the profile lists playwright or chrome-devtools and the work changes UI, offer a walkthrough in the G2 confirmation (flows, viewports such as mobile and desktop, and what counts as a pass). Run it only if the user agrees, and record it in plan section 7 as a verification method.
- Say plainly that it is a scripted walkthrough by an agent, not a test with real users.
- Use only local or user-named URLs, and tell the user the browser tool can see browser content.
- Never enter real credentials, place real orders or payments, send messages, or change data.
