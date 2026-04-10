# Agent-Ready Content Scope

This document defines the source-of-truth content that powers the Zama SDK "work with LLM" experience.

All versioned and user-facing artifacts produced for this project must be written in English.

## Purpose

The goal of this scope is to give LLMs and coding agents a reliable, explicit hierarchy of sources so they can answer integration questions, generate code, and follow official SDK patterns without drifting into unsupported or stale material.

## Source Hierarchy

Agents must consult sources in this order:

1. Official documentation in `docs/gitbook/src`
2. Official examples explicitly approved for V1
3. API reports in `packages/sdk/etc` and `packages/react-sdk/etc`

If an answer is available in the official documentation, the agent should prefer that source over examples or API reports. Examples are reference implementations. API reports are fallback reference material for exported surface details.

## Primary Sources

The following files and directories are the primary source of truth:

- `docs/gitbook/src`
- `docs/gitbook/src/SUMMARY.md`
- `README.md`
- `packages/sdk/README.md`
- `packages/react-sdk/README.md`

## Official Examples for V1

The following examples are approved, reliable, and may be used as official example sources in V1:

- `examples/example-hoodi`
- `examples/node-ethers`
- `examples/node-viem`
- `examples/react-ethers`
- `examples/react-viem`
- `examples/react-wagmi`

## Explicitly Excluded Example

The following example must not be used in the V1 corpus, skills, or validation rules:

- `examples/react-ledger`

It is intentionally excluded from the V1 "work with LLM" implementation because it is not considered a reliable source for this phase.

## Secondary Sources

The following sources are allowed as secondary reference material:

- `packages/sdk/etc/*.api.md`
- `packages/react-sdk/etc/*.api.md`

These sources should not be treated as the primary learning path. They exist to clarify exports, types, and API surface details when the official docs and examples are not sufficient.

## Excluded Content

The following content must not appear in generated LLM artifacts unless a future ticket explicitly changes the scope:

- `docs/gitbook/build`
- `docs/gitbook/book`
- `dist`
- `node_modules`
- `.next`
- generated coverage, temp, or cache outputs
- unrelated experiments or unapproved examples

## Artifact Scope

### `llms.txt`

`llms.txt` must include:

- official documentation pages from `docs/gitbook/src` that are part of the published navigation
- approved official examples
- package README entries used as onboarding context

`llms.txt` must not include:

- API reports
- excluded examples
- generated assets

### `llms-full.txt`

`llms-full.txt` must include:

- official documentation pages from `docs/gitbook/src`
- approved official examples
- root/package README context

`llms-full.txt` must not include:

- API reports
- excluded examples
- generated assets

### Claude Code Skills V1

Claude Code skills in V1 must:

- rely only on the scoped official docs and approved examples
- point users to official guides and examples first
- use API reports only as fallback reference material

Claude Code skills in V1 must not:

- recommend excluded examples
- invent workflows not supported by the docs or approved examples
- contain French text

## Publishing Rules

Every versioned output created for this project must follow these rules:

- English only
- official-source-first
- examples clearly labeled as examples
- API reports clearly labeled as fallback reference material
- no references to excluded or generated content
