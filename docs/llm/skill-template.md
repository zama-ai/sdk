# Claude Code Skill Template

This template defines the structure for V1 Claude Code skills in this repository.

All skill content must be written in English.

## File Layout

Each skill lives in its own directory under `claude-setup/skills/<skill-name>/SKILL.md`.

Optional supporting materials may live under:

- `claude-setup/skills/<skill-name>/references/`

## Frontmatter

Each skill must include YAML frontmatter with:

- `name`
- `description`

The `description` must explicitly say when the skill should be used.

## Required Sections

Each skill should include these sections in this order:

1. `When to Use`
2. `Source Priority`
3. `Reference Files`
4. `Golden Path`
5. `Implementation Rules`
6. `Common Pitfalls`
7. `Done When`

## Source Priority Rule

Every skill must instruct Claude Code to consult sources in this order:

1. official docs in `docs/gitbook/src`
2. approved official examples
3. API reports only when docs and examples are insufficient

## Content Rules

Skills must:

- stay prescriptive
- point to concrete repo paths
- prefer official examples over inferred patterns
- instruct Claude Code to exhaust docs and approved examples before inspecting internal SDK source
- avoid unsupported or undocumented workflows

Skills must not:

- recommend excluded examples such as `react-ledger`
- introduce French text
- treat API reports as the primary onboarding source

## Example Language

Use direct wording such as:

- "Use this skill when..."
- "Start from..."
- "Prefer..."
- "Do not..."

Avoid vague or speculative language.
