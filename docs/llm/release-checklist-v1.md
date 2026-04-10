# Work with LLM V1 Release Checklist

This checklist tracks the validation status of the Zama SDK "work with LLM" V1 implementation.

All versioned and user-facing artifacts are written in English.

## Scope and Corpus

- [x] Official source hierarchy documented in `docs/llm/agent-content-scope.md`
- [x] `react-ledger` explicitly excluded from the V1 corpus
- [x] Approved examples limited to:
  - `example-hoodi`
  - `node-ethers`
  - `node-viem`
  - `react-ethers`
  - `react-viem`
  - `react-wagmi`
- [x] `docs/llm/corpus-manifest.json` generated from the official docs and approved examples

## LLM Artifacts

- [x] `llms.txt` generated at repo root
- [x] `llms-full.txt` generated at repo root
- [x] `pnpm llm:validate` passes
- [x] `pnpm llm:skills:validate` passes
- [x] API reports excluded from `llms.txt` and `llms-full.txt`

## Claude Code Skills

- [x] Claude Code skill template written in `docs/llm/skill-template.md`
- [x] V1 skills added under `claude-setup/skills/`
- [x] Skills target Claude Code only
- [x] Skills reference official docs and approved examples only

## Documentation

- [x] `docs/gitbook/src/guides/build-with-an-llm.md` added
- [x] `docs/gitbook/src/SUMMARY.md` updated
- [x] The guide clearly states that V1 skills target Claude Code only

## Repo Hygiene

- [x] `pnpm lint` passes
- [x] `pnpm typecheck` passes
- [x] `pnpm format:check` passes after the latest artifact rebuild

## Final Pass

Run this sequence before final publication:

```bash
pnpm llm:build
pnpm llm:test
pnpm lint
pnpm typecheck
pnpm format:check
```
