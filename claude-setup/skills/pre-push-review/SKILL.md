---
name: pre-push-review
description: Review the current branch before it is pushed, the way a teammate would review the PR, fix what the review finds, and record the result in the PR description. Fans out one subagent per review lane (correctness, code quality, comments, docs), verifies each finding, fixes it, and commits. Proposes a lint rule or type change only when a mistake class passes a strict filter. Use before opening a PR or pushing a new round of changes, or when the user types /pre-push-review.
---

# Pre-push review

The review a teammate would run on the PR, run by the author before the PR exists. Each finding is fixed here. A new check (type, lint rule, ast-grep rule) is proposed only when the filter in step 4 says the mistake class needs one.

Use only shared inputs: the repo files, `AGENTS.md`, `docs/agents/*`, and the skills in `.claude/skills/` and the zama-developer and zama-protocol plugins. Do not use personal memory or personal skills to decide what is a finding. Every author must get the same review for the same diff.

## 1. Scope

```bash
base=$(git merge-base HEAD origin/beta)   # use the PR's base branch if it is not beta
git log --oneline $base..HEAD
git diff $base --stat
```

If the tree has uncommitted changes, ask whether they belong in this push before you review. If `$base..HEAD` is empty, stop.

Collect the conventions files: root `AGENTS.md`, every `AGENTS.md` under a changed path, and the `docs/agents/*.md` files they link to.

## 2. Fan out the lanes

Send the lanes in one message as parallel `Agent` calls. Each prompt gives the repo path, the range `$base..HEAD`, the changed files, the conventions files, the skills the lane must load, and this rule: _read-only; read changed files in full, not only the diff; finding nothing is a fine answer._ Each lane returns findings as `file:line`, problem, evidence, exact fix, confidence, and the skills it loaded. Skip a lane that has no files to review.

A lane reads a skill without a `plugin:` prefix from `.claude/skills/<name>/SKILL.md` with the `Read` tool, not the `Skill` tool, because a personal skill with the same name overrides the project one. It loads a `plugin:skill` with the `Skill` tool.

| Lane         | Skills to load                                                                                                                 | Looks for                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Correctness  | `zama-protocol:zama-protocol` then `zama-protocol:zama-typescript` for SDK code, `tanstack-best-practices` for react-sdk hooks | Wrong results, crashes, races, swallowed errors, broken conventions, tests that pass when the behavior breaks           |
| Code quality | `thermo-nuclear-code-quality-review`                                                                                           | Missed simplifications, spaghetti branches, wrong layer, files pushed past 1000 lines                                   |
| Comments     | `comments-best-practices`, `jsdoc`                                                                                             | Added or changed comments that restate the code, narrate design, or cite docs or tickets; JSDoc that breaks its rules   |
| Docs         | `zama-developer:sdk-documentation`, `zama-developer:docs`                                                                      | Changed public behavior with no docs update, docs that now contradict the code, missing `llms*.txt` or API report regen |

If a lane's skill can't be loaded (the zama-developer plugin is internal, so external contributors don't have it), the lane applies `AGENTS.md` and `docs/agents/*` instead and reports the missing skill.

Split the correctness lane by package when the diff is large. Keep the total at five agents or fewer.

## 3. Verify and cut

- Dedupe across lanes.
- Check every finding against the code yourself. For anything not obvious, run the test or grep the callers. Drop what does not hold up.
- The bar: a caller using the API as intended gets a wrong result, a crash, or corrupt state; or the change breaks a written convention; or a lane skill rule applies directly. Drop taste, "future PR" ideas, and anything lint already enforces.
- Keep code-quality restructurings only when they are clearly worth doing in this change.

## 4. Fix, and decide whether the class needs a check

For each verified finding:

1. **Fix it.** Ask the user only when a fix needs a product or API decision. A bug fix gets a regression test.
2. **Default to no new check.** Write "prevented by: none". Propose a check only when all of these hold:
   - No type or API change in this diff can make the mistake impossible. If one can, make that change instead: it is the better fix.
   - The check reads the AST, types, or import graph, not wording, and on the base branch it matches only real instances of the mistake. One false positive means no rule.
   - The mistake already escaped at least twice (cite two merged PRs or commits that fixed it), or one miss is expensive: a silent wrong result, a security problem, or lost funds. Other matches of a query are not escapes.

   Prefer, in order: a type or API change, an import boundary (internals that cannot be imported), a targeted lint or ast-grep rule. Do not add a proposed rule in this branch, and never add rules to the lane skills from this step.

Then run `pnpm lint`, `pnpm typecheck`, and the tests for the touched packages. Commit with a conventional message that describes the change, not the review.

If the fixes changed more than a few lines, run steps 2 to 4 once more on the new range. Stop after two rounds and list what is left.

## 5. Record the review

Put the result in the PR description under `## Pre-push review`, replacing any earlier one, so the team can judge later whether the review pays for itself. If the PR does not exist yet, give the section to the user to paste.

```markdown
## Pre-push review

Lanes: correctness, code quality, comments, docs (skills: <skills the lanes loaded>). Rounds: <1 or 2>. Wall time: <minutes>.

Fixed:

- `path/file.ts:54` (correctness): <one line>

Left:

- `path/file.ts:80` (code quality): <one line and why it was not fixed here>

Dropped in verification: <count>

Proposed checks:

- <rule or type change>: <what it matches>; escaped before in <PR or commit>, <PR or commit>
```

Leave out an empty section. Then list the commits you made.
