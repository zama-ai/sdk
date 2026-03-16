---
description: AI Code Factory — process a Linear ticket into a tested, reviewed PR
argument-hint: <ticket-id> or --label <label-name>
---

# AI Code Factory

You are the orchestrator for the AI Code Factory pipeline. You process a Linear ticket end-to-end: fetch requirements, implement, test, document, verify, review, and deliver a PR.

**Read the pipeline reference first:** Use the Read tool to read `skills/factory/references/pipeline-flow.md` from the ai-code-factory plugin directory for the full pipeline specification, inter-agent data contracts, and retry policies.

## Arguments

- `$1` — Either a Linear ticket ID (e.g., `LIN-1234`), `--label`, or `--cleanup`
- `$2` — If `$1` is `--label`, this is the label name (e.g., `ai-factory`)

## Startup Checks

### Check for LINEAR_API_KEY

Verify the Linear MCP server is accessible by attempting to list issues. If it fails, notify:

> LINEAR_API_KEY not configured. Set it in your environment to use the AI Code Factory.

### Check for existing worktrees and state

```bash
git worktree list | grep "factory/"
```

If a worktree exists for the SAME ticket being requested:

1. Check for `.factory-state.json` in the worktree
2. If state file exists, read it and offer:
   > Found interrupted pipeline for LIN-{id} at phase {current_phase} ({phase_name}).
   >
   > - **resume**: Continue from phase {current_phase}
   > - **restart**: Wipe state and start fresh
   > - **cleanup**: Remove worktree and abort
3. Wait for user response.

If worktrees exist for OTHER tickets, prompt:

> Found existing factory worktrees: [list].
>
> - **continue**: Ignore and proceed with current ticket
> - **cleanup**: Remove all stale worktrees first, then proceed

### Cleanup mode

If `$1` is `--cleanup`:

1. List all `factory/*` worktrees
2. Remove each one (worktree + branch)
3. STOP

## Pipeline Execution

### State Management

State is persisted to `<worktree-root>/.factory-state.json` after each phase completes.

**On fresh start:** Initialize state:

```json
{
  "ticket_id": "<id>",
  "started_at": "<ISO timestamp>",
  "current_phase": 1,
  "completed_phases": [],
  "retry_counters": { "quality_gate": 0, "code_review": 0, "red_team": 0, "mutation_test": 0 },
  "agent_outputs": {}
}
```

**After each phase completes:** Update state:

1. Add phase number to `completed_phases`
2. Store agent output in `agent_outputs` (keyed by agent name)
3. Update `current_phase` to the next phase
4. Update `retry_counters` if changed
5. Write state to `.factory-state.json` using the Write tool

**On fix-loop re-entry:** When a downstream phase sends a fix back to an earlier phase (e.g., code review → implementer → quality gate):

1. Remove phases that need re-running from `completed_phases` (e.g., if re-entering at phase 6, remove phases 6, 7, 8 from completed)
2. Clear the corresponding `agent_outputs` for those phases (set to null)
3. Set `current_phase` to the re-entry phase (e.g., 6 for quality gate)
4. Save state — if interrupted during the fix-loop, resume re-enters at the correct phase

**On resume:** Read `.factory-state.json`, load `agent_outputs` as context for downstream agents, skip to `current_phase`.

**On PR creation or abort:** Delete `.factory-state.json`.

**Gitignore:** After creating the worktree, add `.factory-state.json` to the worktree's `.gitignore`:

```bash
echo ".factory-state.json" >> <worktree-root>/.gitignore
```

Max retries per phase: **3**

### Missing Output Markers

If any agent's output does not contain the expected `_OUTPUT_START` / `_OUTPUT_END` markers, treat it as a phase failure. Log the raw output, increment the relevant retry counter, and re-dispatch the agent. If retries are exhausted, escalate to Linear with the raw output attached.

### Phase 1: Ticket Analysis

Dispatch the **ticket-analyzer** agent with the ticket ID or label filter.

Parse the output between `TICKET_ANALYSIS_OUTPUT_START` and `TICKET_ANALYSIS_OUTPUT_END` markers.

- If `tier` is `partially_clear` or `vague`: print the Linear comment that was posted and STOP.
- If `tier` is `clear`: continue.

Print: `📋 Ticket LIN-{id} analyzed — {complexity_estimate} complexity, {len(requirements)} requirements`

Post Linear comment: `🤖 AI Code Factory started processing this ticket.`

### Phase 2: Create Worktree

Use the `using-git-worktrees` skill to create an isolated worktree.

Branch name: `factory/LIN-{id}-{slugified-title}`

After worktree creation, install dependencies:

```bash
cd <worktree-path> && pnpm install
```

Print: `🌿 Worktree created at {path}`

### Phase 3: Implementation

Dispatch the **implementer** agent with:

- Ticket analysis output
- Worktree path

Parse the output between `IMPLEMENTER_OUTPUT_START` and `IMPLEMENTER_OUTPUT_END`.

Print: `🔨 Implementation complete — {len(files_created)} files created, {len(files_modified)} files modified`

### Phase 4: Test Writing

Dispatch the **test-writer** agent with:

- Ticket analysis output
- Implementer output
- Worktree path

Parse the output between `TEST_WRITER_OUTPUT_START` and `TEST_WRITER_OUTPUT_END`.

If `implementation_bugs_found` is not empty:

- Send bugs back to implementer as must-fix issues
- Re-run test writer after fix
- (This is a pre-quality-gate loop and does NOT count against any retry counter. Max 2 iterations — if bugs persist after 2 rounds, proceed to quality gate which will catch them.)

Print: `🧪 Tests written — {total_tests} tests ({unit_test_result}, e2e: {e2e_test_result})`

### Phase 5: Documentation

Dispatch the **doc-writer** agent with:

- Ticket analysis output
- Implementer output
- Worktree path

Parse the output between `DOC_WRITER_OUTPUT_START` and `DOC_WRITER_OUTPUT_END`.

Print: `📚 Docs: {status}`

### Phase 6: Quality Gate

Dispatch the **quality-gate** agent with:

- Worktree path

Parse the output between `QUALITY_GATE_OUTPUT_START` and `QUALITY_GATE_OUTPUT_END`.

**If FAIL:**

- Increment `retry_counters.quality_gate`
- If `retry_counters.quality_gate` >= 3: escalate to Linear and STOP
- Send `failed_check` and `error_output` to implementer as fix context
- After implementer fix, **re-run quality gate from the beginning**

**If PASS:** continue.

Print: `✅ Quality gate passed — all {len(all_results)} checks green`

### Phase 7: Security Review

Dispatch the **security-reviewer** agent with:

- Ticket analysis output
- Implementer output
- Worktree path

Parse the output between `SECURITY_REVIEW_OUTPUT_START` and `SECURITY_REVIEW_OUTPUT_END`.

**If any `must-fix` issue:**

- Post detailed Linear comment with security findings
- Print: `🔒 SECURITY ESCALATION — must-fix security issue found. Posted to Linear. Human review required.`
- STOP (never auto-fix security)

**If only suggestions or no issues:** continue. Store suggestions for PR description.

Print: `🔒 Security review: pass`

### Phase 8: Code Review

Dispatch the **code-reviewer** agent with:

- Ticket analysis output
- Implementer output
- Test writer output
- Worktree path

Parse the output between `CODE_REVIEW_OUTPUT_START` and `CODE_REVIEW_OUTPUT_END`.

**If `must-fix` issues:**

- Increment `retry_counters.code_review`
- If `retry_counters.code_review` >= 3: escalate to Linear and STOP
- Send must-fix issues to implementer
- After implementer fix, **re-enter at Phase 6 (Quality Gate)**

**If only suggestions or no issues:** continue. Store suggestions for PR description.

Print: `📝 Code review: {status}`

### Phase 9: Red Team

Dispatch the **red-team** agent with:

- Ticket analysis output
- Implementer output
- Test writer output
- Worktree path

Parse the output between `RED_TEAM_OUTPUT_START` and `RED_TEAM_OUTPUT_END`.

**If `vulnerabilities_found`:**

- Increment `retry_counters.red_team`
- If `retry_counters.red_team` >= 3: escalate to Linear and STOP
- Send confirmed vulnerabilities to implementer as must-fix issues
- After implementer fix, **re-enter at Phase 6 (Quality Gate)**

**If no vulnerabilities:** continue.

Print: `🔴 Red team: {status} — {len(resilience_confirmations)} attacks tested`

### Phase 10: Mutation Testing

Dispatch the **mutation-tester** agent with:

- Implementer output
- Worktree path

Parse the output between `MUTATION_TESTER_OUTPUT_START` and `MUTATION_TESTER_OUTPUT_END`.

**If `mutation_score` < 80:**

- Increment `retry_counters.mutation_test`
- If `retry_counters.mutation_test` >= 3: escalate to Linear and STOP
- Send surviving mutants to **test-writer** (not implementer)
- After test-writer fix, **re-run mutation testing (Phase 10 only)**

**If score >= 80:** continue.

Print: `🧬 Mutation testing: {mutation_score}% kill rate ({killed}/{total_mutants})`

### Pre-PR Cleanup

Before creating the PR:

1. Verify worktree is clean of mutation artifacts: `git diff` — if unexpected changes, run `git restore .`
2. Delete `.factory-state.json` from the worktree (it's no longer needed after successful pipeline completion)

### Phase 11: Create PR

Dispatch the **pr-creator** agent with ALL accumulated outputs:

- Ticket analysis
- Implementer output
- Test writer output
- Doc writer output
- Quality gate output
- Security review output (suggestions)
- Code review output (suggestions)
- Red team output
- Mutation tester output
- Worktree path

Parse the output between `PR_CREATOR_OUTPUT_START` and `PR_CREATOR_OUTPUT_END`.

Print final summary.

## Escalation

When any phase exhausts retries or a security issue is found, post a Linear comment:

> **AI Code Factory** could not complete this ticket.
>
> **Failed at:** {phase name}
> **Retries exhausted:** {retry_count}/3
> **Last error:**
>
> ```
> {error details}
> ```
>
> Human intervention required.

Then STOP.
