---
title: Build with an LLM
description: How to give Claude Code and other agents high-quality Zama SDK context through llms files, approved examples, and official Claude Code skills.
---

# Build with an LLM

Use the repository's LLM-ready artifacts to give your coding agent a grounded view of the Zama SDK.

Prefer the smallest source that can answer the task, and keep the source order strict: official docs first, approved examples second, API reports only as fallback.

V1 ships:

- `llms.txt` for lightweight discovery
- `llms-full.txt` for full-context grounding
- official **Claude Code** skills

The Claude Code skills are V1-only for now. The `llms` files are agent-agnostic, but the shipped skills currently target Claude Code only.

## Choose the right tool

Use the smallest tool that gives the agent enough context:

- `llms.txt` for navigation and discovery
- `llms-full.txt` for broad grounding
- Claude Code skills for official workflow guidance on supported stacks

For Claude Code on a supported stack, start with the matching skill and use `llms.txt`, `llms-full.txt`, or the approved example docs as supporting context.

## Source of truth

Agent-facing guidance in this repository follows this source order:

1. Official docs in `docs/gitbook/src`
2. Approved official examples
3. API reports as fallback reference material

When the docs already answer the question, prefer the docs over examples. When examples are needed, prefer the approved examples in this repo over ad hoc implementations.

## Build the LLM artifacts

From the repository root:

```bash
pnpm llm:build
pnpm llm:test
```

This generates:

- `./llms.txt`
- `./llms-full.txt`
- `docs/llm/corpus-manifest.json`

`pnpm llm:test` validates the generated artifacts and the Claude Code skills.

## Use `llms.txt`

Use `llms.txt` when your agent needs a compact map of the SDK:

- available guides
- concepts
- SDK reference pages
- React reference pages
- approved examples

This is the best entry point when the agent first needs to discover where to look.

## Use `llms-full.txt`

Use `llms-full.txt` when your agent needs the complete official documentation bundle in one file.

It includes:

- official docs from `docs/gitbook/src`
- approved official examples
- root and package README context

It intentionally excludes API reports so the main bundle stays focused on the public learning path.

## Use the Claude Code skills

This repository ships official Claude Code skills in `claude-setup/skills`.

To install the project Claude Code setup:

```bash
pnpm setup:claude
```

That copies `claude-setup/` into `.claude/` and installs the project-level Claude Code configuration.

Current V1 skills:

- `zama-sdk-react-wagmi`
- `zama-sdk-react-viem`
- `zama-sdk-react-ethers`
- `zama-sdk-node-backend`
- `zama-sdk-local-development`
- `zama-sdk-errors-and-debugging`

Each skill is grounded in the official docs and approved examples from this repository.

The skills are intentionally prescriptive. They are meant to keep Claude Code on the official learning path rather than exploring internal SDK source or unapproved examples too early.

## Use the approved example docs directly

When `llms.txt` points you to an example, read the example docs directly in the repository:

- `examples/example-hoodi/README.md`
- `examples/example-hoodi/WALKTHROUGH.md`
- `examples/node-ethers/README.md`
- `examples/node-viem/README.md`
- `examples/node-viem/WALKTHROUGH.md`
- `examples/react-ethers/README.md`
- `examples/react-ethers/WALKTHROUGH.md`
- `examples/react-viem/README.md`
- `examples/react-viem/WALKTHROUGH.md`
- `examples/react-wagmi/README.md`
- `examples/react-wagmi/WALKTHROUGH.md`

Read the example docs before dropping into example source files.

## Recommended workflow

### For new integrations

1. Start with `llms.txt`
2. Read the closest approved example
3. Use the relevant Claude Code skill
4. Read the matching official guide or reference page directly in the repo when you need more detail

### For deeper grounding

1. Give the agent `llms-full.txt`
2. Read the matching official guide or example docs directly in the repo
3. Fall back to API reports only when the docs and examples do not answer an exported-surface question

### For debugging

1. Start with the error guide
2. Compare against the closest approved example
3. Use the `zama-sdk-errors-and-debugging` skill
4. Inspect API reports only if the exported API surface is still unclear

## Approved examples

The current approved examples are:

- `example-hoodi`
- `node-ethers`
- `node-viem`
- `react-ethers`
- `react-viem`
- `react-wagmi`

`react-ledger` is intentionally excluded from the V1 LLM workflow.

## Prompt ideas

Use prompts like:

```text
Use the official Zama SDK docs and the approved react-wagmi example to integrate confidential balances and transfers into this Next.js app.
```

```text
Use the official Zama SDK docs and the approved node-viem example to build a Node.js backend flow with RelayerNode and per-request credential isolation.
```

```text
Debug this Zama SDK integration using the official error guide first, then compare it to the closest approved example.
```

## Notes

- Keep all published or versioned content in English.
- Treat approved examples as reference implementations, not as substitutes for the official docs.
- Treat API reports as fallback reference material, not as the main onboarding path.
