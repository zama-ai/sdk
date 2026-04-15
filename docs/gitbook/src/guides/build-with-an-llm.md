---
title: Build with an LLM
description: How to give coding agents high-quality Zama SDK context through llms files, approved examples, and the external Zama Protocol Claude Code skill.
---

# Build with an LLM

Use the SDK's LLM-ready artifacts to give your coding agent a grounded view of the Zama SDK.

Prefer the smallest source that can answer the task, and keep the source order strict: official docs first, approved examples second, API reports only as fallback.

The SDK documentation provides:

- [`llms.txt`](https://raw.githubusercontent.com/zama-ai/sdk/main/llms.txt) for lightweight discovery
- [`llms-full.txt`](https://raw.githubusercontent.com/zama-ai/sdk/main/llms-full.txt) for full-context grounding
- guidance for using the external [`zama-protocol`](https://github.com/zama-ai/skills) Claude Code skill

## Choose the right tool

Use the smallest tool that gives the agent enough context:

- `llms.txt` for navigation and discovery
- `llms-full.txt` for broad grounding
- the `zama-protocol` Claude Code skill for Zama FHEVM and SDK workflow guidance

For Claude Code, install the external skill first, then use `llms.txt`, `llms-full.txt`, or the approved example docs as supporting context when the task needs SDK-specific detail.

## Source of truth

Agent-facing guidance follows this source order:

1. Official docs in `docs/gitbook/src`
2. Approved official examples
3. API reports as fallback reference material

When the docs already answer the question, prefer the docs over examples. When examples are needed, prefer the approved examples in this repo over ad hoc implementations.

## Build the LLM artifacts

From the repository root:

```bash
pnpm llm:build
pnpm llm:validate
```

This generates:

- `./llms.txt`
- `./llms-full.txt`
- `docs/llm/corpus-manifest.json`

`pnpm llm:validate` validates the generated artifacts.

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

- official docs from `docs/gitbook/src`
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

The marketplace install requires Claude Code to be able to access the `zama-ai/skills` GitHub repository. If the install command cannot read the marketplace, use `llms.txt` and `llms-full.txt` directly and ask your Zama contact for skill access.

## Use the approved example docs directly

When `llms.txt` points you to an example, read the example docs directly in the repository:

- `examples/example-hoodi/README.md`
- `examples/example-hoodi/WALKTHROUGH.md`
- `examples/node-ethers/README.md`
- `examples/node-ethers/WALKTHROUGH.md`
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
3. Use the `zama-protocol` Claude Code skill if you are working in Claude Code
4. Read the matching official guide or reference page directly in the repo when you need more detail

### For deeper grounding

1. Give the agent `llms-full.txt`
2. Read the matching official guide or example docs directly in the repo
3. Fall back to API reports only when the docs and examples do not answer an exported-surface question

### For debugging

1. Start with the error guide
2. Compare against the closest approved example
3. Use the `zama-protocol` skill if you are working in Claude Code
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
