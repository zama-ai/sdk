---
name: pr-review-context-aware
description:
  Perform high-signal pull request reviews with requirement traceability.
  Validate code quality, linked ticket/doc intent, and discussion history before
  posting batched GitHub review comments.
---

# PR Review Context-Aware Skill (Claude Code)

Use this skill when you need a PR review that is both:

- technically rigorous (bugs, error handling, guideline compliance, tests),
- requirement-aware (ticket/docs intent and acceptance criteria),
- history-aware (avoid repeating already-discussed feedback).

All outputs, comments, and review artifacts must be in English.

## Mandatory Comment Prefix

Any GitHub comment posted by this skill must start with:

```text
[AUTOMATED]
```

## Core Rules

1. High signal only. Do not post subjective or low-confidence comments.
2. No requirement claim without evidence.
3. No duplicate feedback if the same point already exists in PR discussion and
   no relevant code changed since.
4. External link access must be explicit: if a link cannot be accessed, report
   it as blocked instead of guessing.

## Review Workflow

### Step 1: Pre-Review Gate

Stop early if:

- PR is closed, or
- PR is clearly trivial and automatically generated.

Draft PRs should still be reviewed.

### Step 2: Collect PR Context (Required)

First, locate the helper script (local project copy, with fallback to user-installed plugin):

```bash
GH_PR=$(git rev-parse --show-toplevel 2>/dev/null)/claude-setup/skills/pr-review-context-aware/scripts/gh_pr.py
if [ ! -f "$GH_PR" ]; then
  GH_PR=$(find ~/.claude/plugins -name "gh_pr.py" -path "*/ci-skills/*" 2>/dev/null | head -1)
fi
```

Then collect the following before analysis:

```bash
uv run "$GH_PR" pr owner/repo <number> --raw
uv run "$GH_PR" files owner/repo <number> --raw
uv run "$GH_PR" comments owner/repo <number> --raw
uv run "$GH_PR" reviews owner/repo <number> --raw
```

If a linked GitHub issue exists, fetch it:

```bash
uv run "$GH_PR" issue owner/repo <issue_number> --raw
```

### Step 3: Extract and Resolve Linked Sources

Extract URLs from:

- PR title/body,
- linked issue body,
- existing PR review comments (when relevant to scope).

Attempt to resolve links when possible (Linear, Notion, GitHub, docs, RFCs,
etc.). For each link, assign one status:

- `FETCHED`
- `ACCESS_DENIED`
- `NOT_REACHABLE`
- `UNSUPPORTED_SOURCE`

Never invent missing content from inaccessible sources.

#### What to extract from each source type

For **Linear tickets** and **GitHub Issues**:

- Explicit acceptance criteria (in description or as sub-tasks)
- Non-goals and explicit exclusions ("out of scope", "not in this ticket")
- Known edge cases or constraints mentioned in the description
- Implementation decisions recorded in comments (especially maintainer comments)
- Labels, priority, and blocking relationships that may signal risk

For **Notion pages and design docs**:

- Requirements sections and stated constraints
- Known limitations or deferred behaviors
- Performance, security, or compatibility requirements
- Any "open questions" or "risks" sections

For **RFCs and specs**:

- Acceptance criteria and success metrics
- Explicitly listed non-goals
- Edge cases or failure modes the author identified

When sources are fetched, flag any **open questions or unresolved decisions**
in those sources — these signal areas where the implementation may have made
an undocumented assumption.

### Step 4: Build Requirement Ledger

Create a normalized requirement ledger from PR + linked sources:

- `requirement_id`
- `source` (PR / issue / URL)
- `statement`
- `acceptance_criteria` (if explicit)
- `priority` (`HIGH` / `MEDIUM` / `LOW`)

Keep this ledger compact and verifiable.

Use `agents/requirement-traceability.md` to generate the ledger and coverage
mapping.

### Step 5: Requirement Coverage Mapping

Map each requirement to current PR evidence and assign one status:

- `SATISFIED`
- `PARTIAL`
- `NOT_SATISFIED`
- `UNVERIFIABLE`

Each mapping must include evidence:

- file path + line reference, and/or
- test evidence in changed files.

### Step 6: Parallel Technical Review Agents

Run technical agents in parallel on the diff:

- `agents/bug-hunter.md` (run twice for coverage)
- `agents/guideline-compliance.md`
- `agents/error-handling-auditor.md`
- optional: `agents/test-analyzer.md` for larger/behavioral PRs

Each issue must include:

- confidence score (0-100),
- concrete evidence in changed code,
- actionable fix direction.

### Step 7: Validate and Dedupe Findings

For findings with confidence >= 80:

- validate independently using `agents/issue-validator.md`,
- compare against historical comments/reviews and current code delta,
- drop duplicates already raised and still unresolved unless new evidence
  changes severity.

Use `agents/review-history-analyzer.md` for deterministic history-aware
classification before posting.

### Step 8: Final Synthesis and Review Decision

Produce a final review with 4 sections:

1. Requirement Coverage
2. New High-Signal Findings
3. Blocked Context (inaccessible links/sources)
4. Decision (`APPROVE`, `COMMENT`, `REQUEST_CHANGES`)

Only request changes for validated blocking issues.

## Posting Workflow (Batched)

```bash
uv run "$GH_PR" init-review owner/repo <number>
uv run "$GH_PR" post owner/repo <number> /tmp/pr-review-owner-repo-<number>.json
```

If reviewing inside the same repository, use a worktree:

```bash
WORKTREE_PATH=$(uv run "$GH_PR" checkout owner/repo <number>)
cd "$WORKTREE_PATH"
```

Cleanup:

```bash
uv run "$GH_PR" cleanup owner/repo <number>
```

## Script Commands

Run commands with `uv run "$GH_PR" ...`

| Command       | Description                                                        |
| ------------- | ------------------------------------------------------------------ |
| `pr`          | Get PR metadata (title/body/state/draft/head/base/review metadata) |
| `files`       | Get PR files with status and patch info                            |
| `comments`    | Get PR review comments (supports `--unresolved`, `--pending`)      |
| `reviews`     | Get all PR reviews                                                  |
| `issue`       | Fetch issue details                                                 |
| `head`        | Get head commit SHA                                                 |
| `init-review` | Initialize batched review JSON                                     |
| `post`        | Post batched review                                                 |
| `reply`       | Reply to a specific review comment                                  |
| `resolve`     | Resolve/unresolve a review thread                                   |
| `checkout`    | Create local PR worktree                                            |
| `cleanup`     | Remove local PR worktree                                            |

## Output Quality Bar

- Prefer no comment over weak comment.
- Any blocking claim must be evidence-backed and validated.
- If external context is incomplete, state uncertainty explicitly in the
  "Blocked Context" section.
