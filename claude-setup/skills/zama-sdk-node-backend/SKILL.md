---
name: zama-sdk-node-backend
description: "Use when integrating @zama-fhe/sdk into Node.js scripts, workers, services, or backends. Covers RelayerNode, direct relayer auth, storage strategy, per-request isolation, and the approved node-viem and node-ethers examples."
---

# Zama SDK Node Backend

## When to Use

Use this skill when the target integration runs in Node.js rather than the browser: scripts, jobs, bots, HTTP services, or backend workers.

## Source Priority

1. `docs/gitbook/src/guides/node-js-backend.md`
2. `docs/gitbook/src/guides/authentication.md`
3. `docs/gitbook/src/guides/configuration.md`
4. `docs/gitbook/src/reference/sdk/RelayerNode.md`
5. `examples/node-viem/README.md`
6. `examples/node-viem/WALKTHROUGH.md`
7. `examples/node-ethers/README.md`
8. API reports only if exported surface details are still unclear

## Reference Files

- `examples/node-viem/src/index.ts`
- `examples/node-ethers/src/index.ts`

## Golden Path

1. Prefer the approved `node-viem` example as the main backend reference.
2. Use `RelayerNode` for FHE operations in Node.js.
3. Use direct relayer authentication in trusted server environments.
4. Use `memoryStorage` for one-off scripts and `asyncLocalStorage` for per-request isolation in concurrent servers.
5. Create one `ZamaSDK` instance per signer context and reuse a shared `RelayerNode` where appropriate.
6. Terminate the worker pool on shutdown.

## Implementation Rules

- Use browser-free imports from `@zama-fhe/sdk/node` when Node-specific features are required.
- Use the node example entrypoints above as the first code reference before inspecting internal SDK implementation.
- Keep transport config explicit and aligned with official network presets.
- Do not inspect internal SDK source or unrelated frontend examples unless the official docs, approved backend examples, and API reports still leave a concrete exported-surface question unanswered.
- Prefer `node-viem` when teaching or scaffolding a backend flow; use `node-ethers` as a minimal ethers reference only when the target app already depends on ethers.
- Treat storage choice as an architectural decision, not an afterthought.
- Make shutdown and lifecycle cleanup explicit for long-running processes.

## Common Pitfalls

- Do not use `RelayerWeb` in a Node backend.
- Do not reuse in-memory credential state across concurrent users unless that is intentional.
- Do not proxy relayer auth through browser patterns when the code is already server-side.
- Do not forget to terminate the worker pool for long-running services.
- Do not use excluded examples such as `react-ledger`.

## Done When

- The backend uses `RelayerNode` and a documented storage strategy.
- Relayer authentication matches the trusted-server model.
- The code follows the approved `node-viem` or `node-ethers` example shape as appropriate.
- Worker pool lifecycle and request isolation are handled explicitly.
