---
name: expert-panel-review
description: Run a multi-expert review of a codebase or feature using parallel specialist subagents (SEO/growth, content/editorial, UX/accessibility, frontend/performance, code/correctness). Each expert works read-only and returns prioritized P1/P2/P3 findings with file:line references. The lead then independently verifies load-bearing claims, separates confirmed issues from false alarms, presents one synthesized report, and implements only fixes the user authorizes. Use when the user asks to "run it past the experts," "review this," "get a panel," or wants a thorough multi-angle audit before shipping.
---

# Expert Panel Review

A repeatable workflow for auditing a project from several expert angles at once,
then turning the findings into shipped fixes — without trusting any single
reviewer blindly. The core idea: **breadth comes from parallel specialist
subagents; trust comes from independent verification by the lead.**

## When to use this

- The user says "run it past the experts," "review this," "get a panel on it,"
  "audit the site/feature," or asks for a thorough multi-angle critique.
- Before shipping a feature, a redesign, or a content push.
- After a big change, to catch regressions across disciplines.
- A variant: the user wants each expert's single highest-leverage improvement
  ("ask each expert the one thing that would most improve X").

If the user just wants one narrow check (e.g. "is this function correct?"), do
that directly — don't spin up a whole panel.

## The workflow

### 1. Scope the review

Decide what's under review (whole site, one feature, one directory) and which
expert lenses are relevant. The default panel is five lenses; drop or add based
on the project. For a backend service, swap "content/editorial" for "API
design" or "data/security." For a marketing site, keep all five. Don't pad the
panel with lenses that have nothing to look at.

Default lenses (see `lenses.md` for the full briefs):
- **SEO / growth** — discoverability, metadata, structured data, internal
  linking, retention loops.
- **Content / editorial** — clarity, accuracy, depth, voice, trust signals.
- **UX / accessibility** — flows, friction, keyboard/screen-reader support,
  contrast, focus states.
- **Frontend / performance** — bundle size, asset weight, render path, layout
  shift, runtime cost.
- **Code / correctness** — logic bugs, edge cases, type safety, test coverage,
  dead code.

### 2. Dispatch the panel IN PARALLEL

Launch one `general-purpose` (or `Explore`) subagent per lens, **all in a single
message** so they run concurrently. Each subagent gets:

- Its expert brief (from `lenses.md`) — who it is and what it cares about.
- The scope and the repo path.
- A **hard read-only constraint**: it must NOT edit, write, commit, build, run
  migrations, or change any state. It reads the actual code and reports back.
- The required output contract (below). Don't let it return vibes.

**Required output contract for every expert:**
1. A one-paragraph overall verdict (is this good? what's the headline?).
2. Prioritized findings, each tagged:
   - **[P1]** — real problem, ship-blocking or high-impact. Fix before launch.
   - **[P2]** — worth doing, not urgent.
   - **[P3]** — polish / nice-to-have.
   Each finding must include a concrete `file:line` reference, what's wrong, a
   specific recommended fix, and a rough effort estimate (S/M/L).
3. What it checked but found *fine* (so the lead knows coverage, not just gaps).

The full prompt template is in `expert-prompt-template.md`.

### 3. Independently verify load-bearing claims — DO NOT skip this

Subagents are confidently wrong sometimes. Before you act on or report any
**P1**, or any claim that would drive a significant change, the lead verifies it
firsthand by reading the cited code, checking the framework's actual behavior,
or running a targeted test.

This is the heart of the skill. Two real examples from this project:

- **False alarm:** a reviewer flagged `.field { display: flex }` as overriding
  `[hidden]` and leaking a hidden element into view. Verification disproved it —
  Tailwind v4's preflight ships
  `[hidden]:where(:not([hidden=until-found])){display:none!important}`, so
  `[hidden]` wins. No bug. Had we "fixed" it we'd have added noise and possibly
  broken the real behavior.
- **Confirmed:** a reviewer claimed a Hearts rule bug (Q♠ not breaking hearts).
  Reading the controller confirmed it was real, and it got fixed.

Same-looking claims, opposite outcomes — the only way to tell them apart is to
look. A finding you can't verify gets reported as *unverified*, not as fact.

### 4. Synthesize into one report

Merge the five reports into a single verdict for the user. Structure it as:
- **Headline** — overall health in a sentence or two.
- **Confirmed issues** — verified findings, ordered P1 → P3, deduped across
  experts (multiple lenses often flag the same thing — say so, it's signal).
- **False alarms** — claims you checked and disproved, with the one-line reason.
  This builds trust and prevents re-raising them later.
- **Polish / optional** — the P3 long tail, briefly.

Be honest about disagreement between experts; don't paper over it.

### 5. Authorize, then implement

Present the synthesis and let the user decide scope. The established pattern
here is review → user says "build it out" / "do everything" → implement. Do not
start editing during the review. Once authorized:

- Implement the agreed fixes.
- Run the project's gates: typecheck, tests, build (here: `tsc`, Vitest, the
  Astro build).
- Commit with a clear message and push to the working branch.

If the user only authorizes some findings, do those and leave the rest in the
report for later.

## Hard rules

- **Experts are read-only.** Reviewing must never mutate the repo. All edits
  happen in step 5, by the lead, after authorization.
- **Parallel, not serial.** All expert subagents go out in one message.
- **Verify before you trust.** No P1 reaches the user as fact until the lead has
  confirmed it firsthand.
- **One synthesized report**, not five raw dumps. Subagent output is for you;
  the user gets the distilled verdict.
- **Separate confirmed from false from polish.** Always.
- **Don't implement during review.** Wait for the go-ahead.

## Files in this skill

- `lenses.md` — the expert briefs (what each lens is and cares about).
- `expert-prompt-template.md` — the exact prompt to hand each subagent.
