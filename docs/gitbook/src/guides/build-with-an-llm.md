---
title: Build with an LLM
description: How to give coding agents high-quality Zama SDK context through llms files and the external Zama Protocol Claude Code skill.
---

# Build with an LLM

Use the SDK's LLM-ready artifacts to give coding agents a grounded view of the Zama SDK without overloading their context window.

Prefer the smallest source that can answer the task, and keep the source order strict: official docs first, approved examples second, API reports only as fallback.

The SDK documentation provides:

- [`llms.txt`](https://raw.githubusercontent.com/zama-ai/sdk/main/llms.txt) for lightweight discovery
- [`llms-full.txt`](https://raw.githubusercontent.com/zama-ai/sdk/main/llms-full.txt) for full-context grounding
- guidance for using the external [`zama-protocol`](https://github.com/zama-ai/skills) Claude Code skill

## Choose the right source

Use the smallest source that gives the agent enough context:

- Use `llms.txt` when the agent needs to discover the relevant docs, examples, or package README.
- Use `llms-full.txt` only when the agent supports a large context window and needs the complete public learning corpus in one file.
- Use the `zama-protocol` Claude Code skill when working in Claude Code and the task needs Zama FHEVM, Solidity, ERC-7984, SDK, or React SDK workflow guidance.

For Claude Code, install the external skill first, then use `llms.txt` or `llms-full.txt` as supporting SDK-specific context when needed.

## Consumption modes

You do not need to clone the SDK repository to use the LLM artifacts.

### Without cloning the SDK repository

Use this mode when integrating the SDK into an external app:

1. Give the agent [`llms.txt`](https://raw.githubusercontent.com/zama-ai/sdk/main/llms.txt) for discovery, or [`llms-full.txt`](https://raw.githubusercontent.com/zama-ai/sdk/main/llms-full.txt) for full-context grounding.
2. When using `llms.txt`, follow the raw GitHub links to fetch the smallest relevant source.
3. Treat `source_path` values such as `docs/gitbook/src/...` as provenance metadata, not as local paths you need to have.

### With a cloned SDK repository

Use this mode when contributing to the SDK, debugging SDK internals, or inspecting examples locally:

1. Read `docs/gitbook/src/...`, `examples/...`, and package READMEs directly from the local checkout.
2. Use `llms.txt` as a map of the public SDK docs and approved examples.

## Source of truth

Agent-facing guidance follows this source order:

1. Official documentation, published through GitBook and sourced from `docs/gitbook/src` in the SDK repository
2. Approved official examples listed in the `Official Examples` section of `llms.txt`
3. API reports as fallback reference material for exported API details

When the docs already answer the question, prefer the docs over examples. When examples are needed, prefer the approved examples in this repo over ad hoc implementations.

`docs/gitbook/src/...` and `examples/...` are repository-relative source paths. If you have not cloned the SDK repository, use the raw GitHub URLs from `llms.txt` or the embedded content in `llms-full.txt`.

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

Only use it with agents that support large context windows. For normal coding tasks, start with `llms.txt` and fetch only the relevant docs or examples instead of loading the full corpus.

It includes:

- official docs sourced from `docs/gitbook/src`
- approved official examples
- root and package README context

It intentionally excludes API reports so the main bundle stays focused on the public learning path.

## Use the Claude Code skill

Claude Code skills are maintained separately in [`zama-ai/skills`](https://github.com/zama-ai/skills), not in the SDK repository.

Install the `zama-protocol` skill with Claude Code:

```text
/plugin marketplace add zama-ai/skills
/plugin install zama-protocol@zama-skills
```

The skill covers Zama FHEVM concepts, Solidity patterns, ERC-7984, TypeScript SDK integration, React SDK patterns, verified addresses, and common setup paths.

If the marketplace install is unavailable, continue with `llms.txt` or `llms-full.txt`.

## Recommended workflow

### For new integrations

1. Start with `llms.txt`
2. Read the closest approved example from the `Official Examples` section
3. Use the `zama-protocol` Claude Code skill if you are working in Claude Code
4. Read the matching official guide or reference page when you need more detail

### For deeper grounding

1. Give the agent `llms-full.txt`
2. Read the matching official guide or example docs through their raw GitHub links if more detail is needed
3. Fall back to API reports only when the docs and examples do not answer an exported-surface question

### For debugging

1. Start with the error guide
2. Compare against the closest approved example
3. Use the `zama-protocol` skill if you are working in Claude Code
4. Inspect API reports only if the exported API surface is still unclear

## Prompt ideas

Use prompts like:

```text
Use the official Zama SDK docs and the approved react-wagmi example to integrate confidential balances and transfers into this Next.js app.
```

```text
Use the official Zama SDK docs and the approved node-viem example to build a Node.js backend flow with RelayerNode and per-request isolation.
```

```text
Debug this Zama SDK integration using the official error guide first, then compare it to the closest approved example.
```
