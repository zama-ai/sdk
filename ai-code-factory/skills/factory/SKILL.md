---
name: factory
description: |
  AI Code Factory pipeline skill. Provides specialized agents for autonomous
  ticket-to-PR development: ticket analysis, implementation, testing,
  documentation, quality gates, security review, code review, adversarial
  testing, mutation testing, and PR creation.
  Used by the /factory command to orchestrate the full pipeline.
---

# Factory Skill

This skill provides the agent definitions for the AI Code Factory pipeline.
It is not invoked directly — the `/factory` command orchestrates these agents.

## Agents

| Agent             | Purpose                                              |
| ----------------- | ---------------------------------------------------- |
| ticket-analyzer   | Fetch and classify Linear tickets                    |
| implementer       | Write code following project patterns                |
| test-writer       | Write unit (vitest) and E2E (Playwright) tests       |
| doc-writer        | Update mdBook documentation                          |
| quality-gate      | Run all automated checks                             |
| security-reviewer | Security-focused audit (escalates, never auto-fixes) |
| code-reviewer     | Logic, quality, and convention review                |
| red-team          | Adversarial testing — prove bugs with running code   |
| mutation-tester   | Mutate code to verify test quality                   |
| pr-creator        | Create PR, update Linear ticket                      |
