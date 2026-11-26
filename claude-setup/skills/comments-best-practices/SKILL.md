---
name: comments-best-practices
description: Decide when to keep, write, rewrite, or delete code comments. Use when writing new comments, reviewing comments in a PR or the pre-push review, or cleaning up commentary in existing code. Trigger for "should I comment this", "review these comments", "is this comment necessary", "clean up comments". For JSDoc on public exports, also load the jsdoc skill.
---

# Comments best practices

A comment is untyped, unexecuted, unenforced prose next to code that keeps changing. Nothing keeps it true. Every comment is a claim that rots the first time the code around it changes and nobody updates the sentence. A comment that makes confusing code bearable hides a defect: fix the code instead.

## The litmus test

Read the comment. Read the code. **If the comment adds nothing the code does not already say, delete it.** This is mechanical, not a judgment call. `i++; // increment i` fails. So does `// loop over items` above a loop, and a paragraph explaining what a well-named function obviously does.

A comment earns its place only if it does one of two things:

1. Explains **why** this approach was chosen over the obvious one, when no naming can carry that reason.
2. Explains a genuinely complex algorithm **after every simplification has been tried**, not instead of trying.

Otherwise cut it. If the code is what made the comment feel necessary, fix the code: extract a variable or function, rename, or add an assertion for the rule the comment states in prose. The comment text is often the missing name: `// create report` and `// send report` above two blocks ask for `createReport()` and `sendReport()`.

## Delete on sight

| Anti-pattern           | What it looks like                                                                                                                                                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parrot                 | Restates the next line. The most common offender.                                                                                                                                                                                      |
| Mumbling               | Vague, written to satisfy a rule rather than to inform.                                                                                                                                                                                |
| Misleading or rotting  | No longer true. Treat any unenforced claim about behavior as rotted until you check it against code.                                                                                                                                   |
| Journal                | "Previously we...", "renamed from...", dated entries. Git owns history.                                                                                                                                                                |
| Mandated noise         | Exists only because a rule says every function needs one.                                                                                                                                                                              |
| Banners, closing-brace | `////////` dividers, `} // end if`. A function too long to read without them needs splitting.                                                                                                                                          |
| Byline                 | "Added by ...". `git blame` does this better.                                                                                                                                                                                          |
| Commented-out code     | Delete it. Version control remembers.                                                                                                                                                                                                  |
| Nonlocal reference     | Describes something far away; a change the reader can't see invalidates it.                                                                                                                                                            |
| Doc or ticket link     | Ticket refs, internal URLs, `§section` pointers into repo docs. Restate the reasoning inline, or delete the comment if the link is the content. A stable external standard (an EIP or NIST number) may stay when it is the constraint. |

## Keep, in one or two present-tense lines beside the code they protect

- **Rationale:** why this approach over the obvious alternative.
- **External constraints:** API or tool quirks, spec bugs, ordering requirements, races, precision caveats.
- **Workarounds:** with enough context to know when they can go.
- **Safety:** why something is deliberately omitted or guarded.
- **Performance tradeoffs** a maintainer could reasonably break.
- **Warnings of consequence:** "must run before X", "not thread-safe".

A comment with real intent but private shorthand (internal rule codes, design-doc section numbers) gets rewritten to state the reasoning inline, not deleted.

## Bias toward deletion

The default outcome of reviewing a comment is deletion. When in doubt, cut.

- **Design narrative is not a "why".** Keep rationale for an external constraint that would bite a maintainer. "Kept simple on purpose", "the main config knob", "dropped in the first version", "seam for tests" describe your own design process. Delete them.
- **Encodable contracts go into types and tests.** If an invariant fits a type, `readonly`, `never`, or a test assertion, encode it there and delete the sentence. `// does not modify nums` becomes `readonly number[]`.
- **A real footgun gets one line.** Name the hazard; don't walk through the mechanism.
- **Avoid naming other code.** Function, file, and test names go stale on any rename. Describe the local behavior. A `{@link}` (renamed with its target by the TypeScript language service) and stable external names (a viem type, an on-chain revert name, a git option) may stay when load-bearing.

| Delete or collapse                                                                                | What survives                                                        |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `// Reads the config file and returns the parsed settings.` above `readSettings(): Settings`      | Nothing: the name and type say it.                                   |
| A 12-line header walking through how the cache loads, merges, and evicts entries                  | `// Entries expire after one block because a reorg can change them.` |
| `// INVARIANTS: 1. never throws 2. one entry per file ...`                                        | Nothing: encode it in the return type and a test.                    |
| A module header narrating "kept simple on purpose", "the old flag was removed", "v2 will add ..." | Nothing: delete the block.                                           |

Already at the floor, keep as is (an external constraint in one line that code can't express):

- `# $3 is 1 for a branch checkout (including git worktree add) and 0 for a file checkout.`
- `// pnpm doesn't give lifecycle scripts the terminal's stdin, so ask on the terminal directly.`

## Never touch

Directives read by tools: `eslint-disable`, `oxlint-disable`, `prettier-ignore`, `@ts-expect-error`, `@ts-ignore`, `"use client"`, codegen banners, license headers.

## Reviewing comments

Walk every comment in scope and classify it against the litmus test and the table. None passes by default. For each: does it clear one of the two bars? If not, name the anti-pattern and delete it, fixing the code if that is what made it feel necessary. If it clears the bar but is long or cryptic, rewrite it in place. Done means every comment in scope was classified and every deletion was made, not summarized as "mostly fine".

Sources: Ousterhout, _A Philosophy of Software Design_; Martin, _Clean Code_ ch. 4; Linux kernel coding style §8; Kevlin Henney ("comments are deodorant"); refactoring.guru "Comments" smell; Google TypeScript Style Guide; _Effective TypeScript_ item 30.
