---
title: Build with an LLM
description: How to give Claude Code and other agents high-quality Zama SDK context through llms files, an MCP server, and official Claude Code skills.
---

# Build with an LLM

Use the repository's LLM-ready artifacts to give your coding agent a grounded view of the Zama SDK.

Prefer the smallest source that can answer the task, and keep the source order strict: official docs first, approved examples second, API reports only as fallback.

V1 ships:

- `llms.txt` for lightweight discovery
- `llms-full.txt` for full-context grounding
- a local MCP server for structured docs/example/API report access
- official **Claude Code** skills

The Claude Code skills are V1-only for now. The `llms` files and MCP server are agent-agnostic, but the shipped skills currently target Claude Code only.

## Choose the right tool

Use the smallest tool that gives the agent enough context:

- `llms.txt` for navigation and discovery
- `llms-full.txt` for broad grounding
- MCP for targeted reads and search
- Claude Code skills for official workflow guidance on supported stacks

For Claude Code on a supported stack, start with the matching skill and use `llms.txt` or the MCP server as supporting context.

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

`pnpm llm:test` validates the generated artifacts, the Claude Code skills, and the local MCP server behavior.

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

## Use the MCP server

Run the local docs MCP server from the repository root:

```bash
pnpm llm:mcp
```

Register that command as a local stdio MCP server in Claude Code or any other MCP-capable tool.

The server exposes these tools:

- `list_pages`
- `read_page`
- `search_docs`
- `get_nav_tree`
- `list_examples`
- `read_example_doc`
- `search_examples`
- `list_package_readmes`
- `read_package_readme`
- `list_api_reports`
- `read_api_report`

Use the MCP server when your agent needs targeted reads or search instead of ingesting the full bundle.

`list_pages` and `search_docs` also support an optional `category` filter when you want to narrow a lookup to guides, concepts, or reference sections.

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

## Recommended workflow

### For new integrations

1. Start with `llms.txt`
2. Read the closest approved example
3. Use the relevant Claude Code skill
4. Use the MCP server for focused follow-up reads

### For deeper grounding

1. Give the agent `llms-full.txt`
2. Use the MCP server for targeted lookup
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
