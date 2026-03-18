---
name: skill-packaging-lint
description: Use this skill whenever the user asks to lint, audit, validate, or review an agent skill package, especially for SKILL.md/frontmatter checks, broken local links, missing bundled references, stale metadata, or packaging consistency across .agents/skills or ~/.agents/skills. Also use it when the user asks whether a skill is packaged correctly, wants a report-only pass, or wants a repo script/test for skill validation.
license: MIT
---

# Purpose

This skill helps audit agent skills for packaging correctness.

It is optimized for:
- report-only validation by default
- checking local skills under `.agents/skills/` or `~/.agents/skills/`
- validating `SKILL.md`, frontmatter, bundled references, and local markdown links
- catching stale packaging metadata after skills are moved or repackaged

# Default behavior

Start with a **read-only, report-only** lint pass unless the user explicitly asks for fixes.

When asked to lint a skill:
1. Identify whether the target is a single skill directory or a skills root containing multiple skills.
2. Prefer the repository lint script if one exists.
3. Summarize findings by skill, with clear issue categories and file paths.
4. Do not edit anything unless the user asks for a fix pass.

# In this repository

Use the repo lint script first:
- `npm run lint:skills`
- `npm run lint:skills -- .agents/skills/pi-sdk-docs`
- `npm run lint:skills -- --json`

The implementation lives at:
- `scripts/lint-skills.ts`
- `src/skill-lint.ts`
- `test/skill-lint.test.ts`

# What to check

## Required structure
- `SKILL.md` exists
- if the skill references packaged resources, those paths exist
- if `sources.md` exists, its referenced packaged paths exist

## Frontmatter
Check for:
- `name`
- `description`
- `license` if the repo expects it
- consistency between frontmatter name and directory name

## Reference integrity
Check for:
- broken local markdown links
- stale packaged paths in backticks such as `reference/...`, `references/...`, `scripts/...`, `assets/...`, or `sources.md`
- wildcard references that no longer match any packaged files

## Stale metadata
Look for signs that the skill was moved or refreshed incompletely, for example:
- references to old directories
- stale provisional/version-pin notes
- stale repository-context claims that no longer match the repo

# Output format

Keep the report concise and structured:
- overall result
- per-skill status
- findings grouped by category
- explicit file paths
- whether the pass was read-only

If there are no issues, say so clearly.

# Fix pass guidance

Only move from linting to edits if the user asks.

When fixing:
1. repair broken packaged paths and local links
2. refresh stale repo-context or version-drift language
3. rerun the same read-only lint pass
4. report what changed and whether the skill is now clean

# Notes

- Prefer deterministic script results over ad-hoc manual inspection when a repo script exists.
- If the script and your manual inspection disagree, report the discrepancy explicitly.
- Treat lint output as evidence, then add concise judgment rather than restating raw output verbatim.
