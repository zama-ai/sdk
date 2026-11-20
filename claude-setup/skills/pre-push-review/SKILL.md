---
name: pre-push-review
description: Review the current branch before it is pushed, the way a teammate would review the PR, then fix what the review finds and record a report that unlocks `git push` and `gh pr create`. Fans out one subagent per review lane (correctness, code quality, comments, docs), verifies each finding, fixes it, and commits. Use before any push or PR, when the pre-push gate blocks a push, or when the user types /pre-push-review.
---

# Pre-push review

The review a teammate would run on the PR, run by the author before the PR exists. Findings are fixed here, not posted. The human reviewer later reviews this report and what it missed (see the `review-retro` skill).

Use only shared inputs: the repo files, `AGENTS.md`, `docs/agents/*`, and the skills in `.claude/skills/` and the zama-developer plugin. Do not use personal memory or personal skills to decide what is a finding. Every author must get the same review for the same diff.

## 1. Scope

```bash
base=$(git merge-base HEAD origin/beta)   # use the PR's base branch if it is not beta
git log --oneline $base..HEAD
git diff $base --stat
```

If the tree has uncommitted changes, ask whether they belong in this push before you review. If `$base..HEAD` is empty, stop.

Collect the conventions files: root `AGENTS.md`, every `AGENTS.md` under a changed path, and the `docs/agents/*.md` files they link to.

## 2. Fan out the lanes

Send the lanes in one message as parallel `Agent` calls. Each prompt gives the repo path, the range `$base..HEAD`, the changed files, the conventions files, the skills the lane must load with the `Skill` tool, and this rule: _read-only; read changed files in full, not only the diff; finding nothing is a fine answer._ Each lane returns findings as `file:line`, problem, evidence, exact fix, confidence, and the skills it loaded. Skip a lane that has no files to review.

| Lane         | Skills to load                                                                              | Looks for                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Correctness  | `zama-protocol:zama-typescript` for SDK code, `tanstack-best-practices` for react-sdk hooks | Wrong results, crashes, races, swallowed errors, broken conventions, tests that pass when the behavior breaks           |
| Code quality | `thermo-nuclear-code-quality-review`                                                        | Missed simplifications, spaghetti branches, wrong layer, files pushed past 1000 lines                                   |
| Comments     | `jsdoc`; spawn the `pstack:comment-sicko` agent for this lane when pstack is installed      | Added or changed comments that restate the code, explain a workaround, or break the JSDoc rules                         |
| Docs         | `zama-developer:sdk-documentation`, `zama-developer:docs`                                   | Changed public behavior with no docs update, docs that now contradict the code, missing `llms*.txt` or API report regen |

The comment-sicko agent (from the public `pstack` plugin in `cursor/plugins`) edits comments instead of reporting them. Treat its diff as its findings and verify it in step 3 like any other lane.

Split the correctness lane by package when the diff is large. Keep the total at five agents or fewer.

## 3. Verify and cut

- Dedupe across lanes.
- Check every finding against the code yourself. For anything not obvious, run the test or grep the callers. Drop what does not hold up.
- The bar: a caller using the API as intended gets a wrong result, a crash, or corrupt state; or the change breaks a written convention; or a lane skill rule applies directly. Drop taste, "future PR" ideas, and anything lint already enforces.
- Keep code-quality restructurings only when they are clearly worth doing in this change.

## 4. Fix

Apply each verified finding. Ask the user only when a fix needs a product or API decision. Then run `pnpm lint`, `pnpm typecheck`, and the tests for the touched packages. Commit the fixes with a conventional message that describes the change, not the review.

If the fixes changed more than a few lines, run steps 2 to 4 once more on the new range. Stop after two rounds and list what is left.

## 5. Record the report

Write the report to the scratchpad, then save it for the current tree:

```bash
node scripts/review/stamp.mjs write <report.md>
```

Do this after the last commit and after any rebase: the stamp is keyed to the tree of `HEAD`, and the push gate checks it.

Report shape (it goes in the PR body under "Pre-push review"):

```markdown
Lanes: correctness, code quality, comments, docs (skills: <skills the lanes loaded>)

Fixed:

- `path/file.ts:54` (correctness): <one line>

Left for the reviewer:

- `path/file.ts:80` (code quality): <one line and why it was not fixed here>

Dropped in verification: <count>
```

**Reply:** the report path, the counts per lane, and the commits you made.
