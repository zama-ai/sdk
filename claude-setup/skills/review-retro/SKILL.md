---
name: review-retro
description: "For comments that still reach a PR after the pre-push review: take what a human or bot reviewer caught, find why the pre-push review missed it, and, only for a mistake class that has already escaped at least twice or is expensive to miss, change the repo so it cannot happen again at the highest layer that works (types or API, import boundaries, a targeted lint rule). Proves each new check fails on the flagged code, and records where each rule came from so it can be retired later. Use for /review-retro <PR number or URL> [--auto]."
disable-model-invocation: true
---

# Review retro

Some comments a reviewer writes are mistakes the pre-push review should have caught. Find those, and add a check only for the ones that keep coming back. Most comments need no new check: a better API, a fix, or nothing.

Read GitHub only. Never comment, review, resolve threads, or push. Make the fixes on a new branch, one commit per mistake class.

## 1. Fetch the review

```bash
.claude/skills/review-retro/scripts/fetch-review.sh <pr> > <scratchpad>/review.jsonl
```

The script prints one JSON line per review thread, review body, and human comment. Thread lines have `path`, `line`, `commit`, and `hunk`, the code the reviewer saw. If the file has more than 40 lines, give it to a subagent and have it return the grouping from step 2.

## 2. Group into mistake classes

A mistake class is one wrong decision that shows up in one or more comments. Drop typos, one-off taste, and comments the author rejected with a reason that holds. Judge bot comments on their merits.

For each class, record why the pre-push review missed it:

- **No lane covers it.** The kind of problem has no lane or no skill.
- **The skill has no rule for it.** A lane ran the right skill, but the skill does not say this.
- **The rule exists and was skipped.** The rule is written, but nothing makes it fail.
- **It needs product judgment.** Only a human can decide it. Keep it as a human review item.

## 3. Count escapes

A class gets a check only after it has escaped twice, or when one miss is expensive: a silent wrong result, a security problem, or lost funds. An escape is this PR or an earlier merged PR or commit that fixed the same mistake. Cite each one.

Matches of the class's `rg` or `ast-grep` query on the base branch are weeds: old instances the next agent can copy. Report them, but do not count them as escapes.

Any other class that escaped once gets no check. If it is a bug, it gets a regression test. List it under the table.

## 4. Pick the layer and present the table

Use the filter and the order in the `pre-push-review` skill (step 4): a type or API change first, then an import boundary, then a targeted lint or ast-grep rule. A rule must match only real instances on the base branch. Add a rule to a lane skill only for a judgment call no check can make.

| Mistake class                 | Escapes        | Why pre-push review missed it | Fix                                                       | Weeds           |
| ----------------------------- | -------------- | ----------------------------- | --------------------------------------------------------- | --------------- |
| One line, link to the comment | Each one cited | From step 2                   | Exact type or API change, rule and message, or skill line | Count and query |

Under the table, list the classes that escaped once and the dropped comments, one line each. Wait for the operator to confirm unless they passed `--auto`.

## 5. Fix, clean, and prove

For each confirmed class:

1. Build the check. Run it on the code at the thread's `commit` (`git worktree add` or `git show <commit>:<path>`). It must fail on the flagged line. If it passes, fix the check.
2. Record where it came from. An ast-grep rule sets `url:` to the first escape and `metadata: { escapes: [<PRs>], added: YYYY-MM-DD }`. An oxlint rule gets the same facts in a comment next to it.
3. Fix the weeds, at most five in this branch. If there are more, stop and ask. If a weed needs a decision you cannot make, add a line-level exception that names the reason.
4. Run `pnpm lint`, `pnpm typecheck`, and `pnpm test:run`. Report each command and its result.

**Reply:** the final table with a Status column, the proof command for each class with its failing and passing output, the weeds fixed, and the classes left for human judgment.
