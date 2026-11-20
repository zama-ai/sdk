---
name: review-retro
description: "The reviewer's job once every PR has a pre-push review: take what a human or bot reviewer still caught on a PR, find why the pre-push review missed it, and change the repo so it cannot happen again. Fixes each repeated mistake class at the highest layer that works (architecture, types, lint, test, then the review skills), proves the new check fails on the flagged code, and removes old copies of the pattern. Use for /review-retro <PR number or URL>."
disable-model-invocation: true
---

# Review retro

The PR body has a pre-push review report. Every comment a reviewer still had to write is a miss. For each kind of miss, change the repo so the next agent cannot make the mistake, or so the pre-push review catches it.

Read GitHub only. Never comment, review, resolve threads, or push. Make the fixes on a new branch, one commit per mistake class.

## 1. Fetch the review

```bash
.claude/skills/review-retro/scripts/fetch-review.sh <pr> > <scratchpad>/review.jsonl
gh pr view <pr> --json body --jq .body   # the "Pre-push review" section
```

The script prints one JSON line per review thread, review body, and human comment. Thread lines have `path`, `line`, `commit`, and `hunk`, the code the reviewer saw. If the file has more than 40 lines, give it to a subagent and have it return the grouping from step 2.

## 2. Group into mistake classes

A mistake class is one wrong decision that shows up in one or more comments. Drop typos, one-off taste, and comments the author rejected with a reason that holds. Judge bot comments on their merits.

For each class, record why the pre-push review missed it:

- **No lane covers it.** The kind of problem has no lane or no skill.
- **The skill has no rule for it.** A lane ran the right skill, but the skill does not say this.
- **The rule exists and was skipped.** The rule is written, but nothing makes it fail. Prose did not work, so move it down the ladder.
- **It needs product judgment.** Only a human can decide it. Keep it as a human review item.

## 3. Count occurrences and weeds

A class gets a check only after it has happened twice. Count:

- each separate place on this PR where a comment flags it;
- each match of the class's `rg` or `ast-grep` query on the base branch outside this PR (a weed: an old instance the next agent can copy);
- each earlier PR or commit that fixed the same mistake. Cite it.

A class that happened once gets no check. Fix it in the PR and list it under the table.

## 4. Pick the layer and present the table

Use the highest layer that can enforce the class:

1. **Architecture.** One owner per piece of state, one supported way per task, internals that cannot be imported.
2. **Types.** The bad state cannot be written.
3. **Lint or CI check.** The error message names the right file, type, or function. If the pattern is common, fail only on new instances.
4. **Test.** It fails when the behavior breaks.
5. **Review skill rule.** Only for judgment calls. Add the rule to the lane skill in `claude-setup/skills/` that should have caught it, or add a lane.

Never fix a class with a personal memory or a personal skill. If the rule already lives in someone's memory, move it into one of the layers above.

| Mistake class                 | Occurrences    | Why pre-push review missed it | Layer  | Fix                                                    | Weeds           |
| ----------------------------- | -------------- | ----------------------------- | ------ | ------------------------------------------------------ | --------------- |
| One line, link to the comment | Each one named | From step 2                   | 1 to 5 | Exact type, rule with its message, test, or skill line | Count and query |

Under the table, list the classes that happened once and the dropped comments, one line each. Wait for the operator to confirm unless they passed `--auto`.

## 5. Fix, clean, and prove

For each confirmed class:

1. Build the check. Run it on the code at the thread's `commit` (`git worktree add` or `git show <commit>:<path>`). It must fail on the flagged line. If it passes, fix the check.
2. Fix every weed. Use a codemod for more than a few. If a weed needs a decision you cannot make, add a line-level exception that names the reason and asks for a human owner.
3. Run `pnpm lint`, `pnpm typecheck`, and `pnpm test:run`. Report each command and its result.

**Reply:** the final table with a Status column, the proof command for each class with its failing and passing output, the weeds removed, and the classes left at layer 5 with the judgment they need.
