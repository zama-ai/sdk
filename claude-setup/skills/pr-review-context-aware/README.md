# PR Review Context-Aware Skill

This Claude Code skill extends the baseline PR review workflow with:

- linked source resolution (tickets/docs URLs when accessible),
- requirement traceability (what was requested vs what changed),
- history-aware deduplication (avoid repeating previous comments).

The technical review stack from `pr-review` is preserved (bug, guideline,
error-handling, test analysis), with stricter evidence requirements before
posting comments.
