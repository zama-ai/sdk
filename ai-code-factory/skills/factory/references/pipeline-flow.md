# AI Code Factory — Pipeline Reference

## Pipeline Order

1. Ticket Analyzer → structured requirements
2. Create worktree + pnpm install
3. Implementer → code changes
4. Test Writer → unit + E2E tests
5. Doc Writer → mdBook updates (if needed)
6. Quality Gate → build, typecheck, format, lint, test, e2e, api-report, docs:build
7. Security Reviewer → escalate or pass
8. Code Reviewer → must-fix or pass
9. Red Team → adversarial tests
10. Mutation Tester → mutation score
11. PR Creator → commit, push, PR, Linear update

## Retry Policy

- Each phase has a **global counter of 3 retries** that persists across re-entries.
- After fix-loops, pipeline re-enters at **Quality Gate** (step 6) except mutation→test-writer which re-enters at step 10.
- Exhausted retries → post Linear comment with failure details, stop.
- Security must-fix → always escalate to human immediately.

## Inter-Agent Data Contract

Agents communicate via structured text passed through the orchestrator. Each agent outputs a clearly labeled section that downstream agents can parse.

### Ticket Analyzer Output

```yaml
ticket_id: string
title: string
tier: clear | partially_clear | vague
requirements: string[]
affected_packages: string[]
affected_files: string[]
acceptance_criteria: string[]
test_hints: string[]
complexity_estimate: small | medium | large
```

### Implementer Output

- List of files created/modified with brief descriptions
- Out-of-scope flags (if any)
- Self-validation results (typecheck, format, lint)

### Test Writer Output

- List of test files created
- Test count (unit + E2E)
- Coverage summary for new code

### Doc Writer Output

- List of doc pages created/modified, or "no changes needed"
- docs:build result

### Quality Gate Output

```yaml
status: pass | fail
failed_check: string (if failed)
error_output: string (truncated)
all_results: [{ check, status, duration }]
```

### Review Agent Output (Security, Code)

```yaml
issues:
  - file: string
    line_range: string
    severity: must-fix | suggestion
    description: string
    proposed_fix: string
```

### Red Team Output

- Confirmed vulnerabilities with test file paths
- Resilience confirmations

### Mutation Tester Output

```yaml
mutation_score: number (percentage)
total_mutants: number
killed: number
survived:
  - file: string
    line: number
    mutation: string
```

### PR Creator Output

- PR URL
- Linear ticket update confirmation

## State Persistence

Pipeline state is saved to `<worktree-root>/.factory-state.json` after each phase.

```json
{
  "ticket_id": "LIN-1234",
  "started_at": "2026-03-16T10:00:00Z",
  "current_phase": 6,
  "completed_phases": [1, 2, 3, 4, 5],
  "retry_counters": {
    "quality_gate": 1,
    "code_review": 0,
    "red_team": 0,
    "mutation_test": 0
  },
  "agent_outputs": {
    "ticket_analysis": "... full output ...",
    "implementer": "... full output ...",
    "test_writer": "... full output ...",
    "doc_writer": "... full output ...",
    "quality_gate": null,
    "security_review": null,
    "code_review": null,
    "red_team": null,
    "mutation_tester": null
  }
}
```

- Created after Phase 1 completes.
- Updated after every phase completion.
- Deleted after PR creation or manual cleanup.
- Added to `.gitignore` in the worktree.

On resume: orchestrator loads state, skips completed phases, re-enters at `current_phase`.

## Project Tooling

- **Build:** `pnpm build`
- **Typecheck:** `pnpm typecheck`
- **Format:** `pnpm format` (apply) / `pnpm format:check` (verify) — oxfmt
- **Lint:** `pnpm lint` (check) / `pnpm lint:fix` (auto-fix) — oxlint
- **Unit tests:** `pnpm test:run` — vitest
- **E2E tests:** `pnpm e2e:test` — Playwright
- **API report:** `pnpm api-report:check` — api-extractor
- **Docs:** `pnpm docs:build` — mdBook (directory: docs/gitbook/)
- **Coverage:** 80% threshold (lines, branches, functions)

## Git Conventions

- Branch naming: `factory/LIN-{id}-{short-description}`
- Commit format: conventional commits (e.g., `feat(sdk): add batch transfer (LIN-1234)`)
- Worktree location: managed by `using-git-worktrees` skill
