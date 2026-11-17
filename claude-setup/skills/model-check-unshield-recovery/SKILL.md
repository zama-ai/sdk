---
name: model-check-unshield-recovery
description: "Model-check, with TLA+ and TLC, that an interrupted two-phase unshield can always be found and resumed: WrappedToken.unshield/unshieldAll/resumeUnshield/getPendingUnshield and the zama:pending-unshield storage pointer. Use when a change touches those methods, pending-unshield.ts, submitTransaction, isInvalidUnwrapRequestRevert, or anything that reads or writes the pending-unshield pointer, or when asked whether an interrupted unshield can be lost."
---

# Model-check unshield recovery

An unshield is two transactions. `unwrap` burns the confidential amount and opens an unwrap request on the wrapper. `finalizeUnwrap` pays out the ERC-20 and deletes the request. Between the two, the SDK keeps one pointer in `sdk.storage` under `zama:pending-unshield:<wrapper>`, so that `getPendingUnshield()` can find an interrupted unshield and the app can offer `resumeUnshield()`. The unshield guide (`docs/gitbook/src/guides/unshield-tokens.md`, "Handle interrupted unshields") promises this.

**Harm when it breaks:** the user's confidential balance is burned, the ERC-20 never arrives, and the app shows no resume prompt. The request stays open on-chain, so only someone who digs out the unwrap transaction can finalize it.

## The rules

All three are in `model/UnshieldRecovery.tla`.

| Rule                            | In plain words                                                                                                                                                                                                                                                                   |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PendingUnshieldIsDiscoverable` | When an unwrap request is open on-chain and no SDK call is still working on it, `getPendingUnshield()` returns the hash of an open request.                                                                                                                                      |
| `PointerKeptAfterSave`          | After `savePendingUnshield` writes the pointer for a request, the pointer stays until that request is finalized on-chain.                                                                                                                                                        |
| `NoFalseAlreadyFinalized`       | The SDK reports "already finalized" (it throws `UnshieldAlreadyFinalizedError`, or `getPendingUnshield()` clears the pointer and returns `null`) only for a request that is finalized on-chain. If this breaks, the app tells the user that the funds arrived when they did not. |

## When to use this skill

Run the check when a change touches a function in the coverage record at the end of this file. Also run it when a change adds code that reads or writes the `zama:pending-unshield:` key, or changes how a finalize error is classified. Run it too when someone asks whether an interrupted unshield can be lost.

## Run

From the repo root:

```sh
node claude-setup/skills/model-check-unshield-recovery/scripts/check.mjs
```

- Needs Java 11 or later. On macOS, run `brew install openjdk`, or set `JAVA=/path/to/java`.
- The first run downloads TLC 1.7.4 (`tla2tools.jar`, checked against its sha256) to `~/.cache/zama-sdk-model-check/`. Set `TLA2TOOLS=/path/to/tla2tools.jar` to use your own copy.
- The replay step needs `pnpm install`.
- A full run takes about 10 seconds.
- `--traces` also prints the known counterexamples. `--no-replay` skips the vitest replay.

The command does three things and exits 0 only when all three match what is recorded:

1. **Drift.** It compares the text of each covered function, with comments removed, against its text at the sync commit. A changed function means that the model may no longer describe the code.
2. **Model.** It runs TLC once for each row of `RUNS` in `scripts/check.mjs`. Each row is one config and one rule. It compares the result, and for a known finding the shortest counterexample, with the row.
3. **Replay.** It runs `replay/findings.test.ts`, which drives the real `WrappedToken` through each known finding against an in-memory wrapper. While the finding exists in the code, the test passes.

## Read the result

- `ok`: the rule holds in every reachable state of that config.
- `FINDING`: a known finding still breaks the rule, along the recorded path. This is not a regression.
- `UNEXPECTED`: a rule that held now breaks, a known finding now holds, or a known finding's path changed. The path is printed one step per line, as `Action(process)` followed by the variables that changed.
- `ERROR`: TLC failed, or found a deadlock. This is a modeling error, not a finding.
- `changed: <file> <function>`: covered code changed since the sync commit. Until you mirror the change in the model, a pass describes the old code.

Read every TLC result with the `/statechart` skill from pstack (in Claude Code: `/pstack:statechart`). Give it `model/UnshieldRecovery.tla` and a config from `model/`. For each broken rule it tells the shortest path in plain words. When the rules hold, it draws how the unshield moves between states.

**A real bug, or a modeling error?** Replay the path against the real code, one step for each action. Copy the pattern in `replay/findings.test.ts`: `fakeWrapper` opens a request on `unwrap`, deletes it on `finalizeUnwrap`, and answers `unwrapRequester`. If a step cannot happen in the code, the model is wrong, so fix the model. If every step happens, it is a bug. Report it with the path in the code's words. Do not weaken the rule, and do not change product code unless the user asks you to.

## How the model maps to the code

Each process is one SDK call on one wrapper with one storage. Each action is one `await` that reads or writes the storage or the chain. Awaits that touch neither, such as encryption or a chain-id check, fold into the next action. JavaScript runs nothing else between two awaits, so other calls (another tab, a second click) can interleave only at actions. The comment above each action names its code.

| Action                                                                               | Code                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SubmitUnwrap`, `UnwrapReceipt`                                                      | `#unwrap` / `unwrapAll` → `submitTransaction`: `signer.writeContract`, then `provider.waitForTransactionReceipt` and `#extractUnwrapRequestId`                                                              |
| `MineUnwrap`, `FinalizeMined`, `FinalizeMinedReverted`                               | The chain: `_unwrap` opens the request; `finalizeUnwrap` deletes it and pays out, or reverts                                                                                                                |
| `Save`                                                                               | `#finalizeUnshield` → `savePendingUnshield` (one `storage.set` on the key for this wrapper)                                                                                                                 |
| `Decrypt`, `SubmitFinalize`, `FinalizeReceiptOk`, `FinalizeReceiptFails`             | `#finalizeUnwrap`: `decryptPublicValues`, then `submitTransaction` for `finalizeUnwrap`                                                                                                                     |
| `FinalizeRejectedGone`, `FinalizeRejected`, `ConsumedYes`, `ConsumedNo`, `HealClear` | The `catch` in `#finalizeUnshield`: `isInvalidUnwrapRequestRevert`, or a `TransactionRevertedError` plus `#isUnwrapRequestConsumed`, then `#clearStoredPendingUnshield` and `UnshieldAlreadyFinalizedError` |
| `ClearDone`                                                                          | `#finalizeUnshield` success path: `#clearStoredPendingUnshield("unshield")`                                                                                                                                 |
| `LoadPointer`, `PointerConsumed`, `PointerReported`, `ClearStalePointer`             | `getPendingUnshield`: `loadPendingUnshieldRequest`, `#isPendingUnshieldConsumed`, `#clearStoredPendingUnshield`                                                                                             |
| `ResumeKnownHash`, `ResumeReceipt`, `ResumeSeesFinalized`, `ResumeProceeds`          | `resumeUnshield`: receipt, `#extractUnwrapRequestId`, `#isUnwrapRequestConsumed`, then the clear-and-throw path or `#finalizeUnshield`                                                                      |
| `Stop`                                                                               | The tab closes, or an awaited call throws and the error leaves the SDK call with no storage write                                                                                                           |

## Known findings at the sync commit

Run with `--traces` to see each path as TLC prints it. Both findings replay against the real code in `replay/findings.test.ts`.

1. **Unsaved window** (`OneUnshield` / `PendingUnshieldIsDiscoverable`). `unshield()` → `#unwrap` → `signer.writeContract` returns the unwrap hash → `provider.waitForTransactionReceipt` throws (an RPC timeout, or a wallet hash that the RPC never finds), or the tab closes → `unshield()` throws `TransactionRevertedError` before `#finalizeUnshield` reaches `savePendingUnshield` → the unwrap transaction is mined anyway. The request is open, the storage is empty, and `getPendingUnshield()` returns `null`. The guide says that the hash is saved "when phase 1 is submitted", but the code saves it only after the receipt.
2. **One pointer per wrapper** (`TwoUnshields` / `PointerKeptAfterSave` and `PendingUnshieldIsDiscoverable`). The key holds one request for each wrapper, with no account and no request id in it, and every clear deletes the key whatever it holds. Path: `unshield(A)` saves A. The finalize of A fails (for example, `decryptPublicValues` throws), so pointer A stays, which is correct. Then `unshield(B)` on the same wrapper saves B over A, finalizes, and clears the key. Request A is still open, and `getPendingUnshield()` returns `null`. Two tabs or two accounts in one browser reach the same state. So does a `getPendingUnshield()` or `resumeUnshield()` that clears a stale pointer after another call saved a new one.

## Bounds and assumptions

- One wrapper and one storage. `OneUnshield.cfg` has one `unshield()` call and one page load. The page load calls `getPendingUnshield()` and then `resumeUnshield()`, or calls `resumeUnshield()` with a hash that the app kept. `TwoUnshields.cfg` has two `unshield()` calls and one page load. Each call runs once. The configs have about 550 and about 40,000 distinct states.
- Rows marked `[phase 1 always saves]` set `StopBeforeSave = FALSE`: phase 1 always reaches `savePendingUnshield`. They keep finding 2 apart from finding 1, and they check the one-unshield promise after phase 1.
- `storage.set` and `storage.delete` succeed, and each is atomic. `swallow` hides a failed write, and the model does not cover that case.
- The wrapper behaves like `ERC7984ERC20WrapperUpgradeable`: `unwrap` opens a request, `finalizeUnwrap` deletes it or reverts with `InvalidUnwrapRequest`, `unwrapRequester` returns zero once the request is gone, and a finalized request never reopens. The `unwrapRequestId` comes from this wrapper's own `UnwrapRequested` event.
- An unwrap that reverts or is dropped opens no request. The model treats it like a transaction that is never mined.
- Not covered: the low-level `unwrap` / `unwrapAll` / `finalizeUnwrap` used without `unshield()` (the guide says those callers own the persistence), legacy hash-only pointers, React hooks and query invalidation, amounts and balances, the relayer's decryption, and liveness (that a stranded request is finalized in the end). A pass covers these bounds only.

## When a change to covered code is intended

1. For each `changed:` line, read `git diff <sync-commit> -- <file>`.
2. Mirror the change in the model action whose comment names that code. An `await` that reads or writes the storage or the chain stays one action. A new storage read or write, a new chain read or transaction, or a new `catch` branch is a new action. Write the update from the code, not from what makes the check pass.
3. Run the check again. If a rule breaks after a faithful update, it is a finding: replay it and report it. Change a rule only when the promise changed on purpose, and cite the evidence: the doc comment, the unshield guide, the tests, or the changelog.
4. If a fix removes a finding, set its rows in `RUNS` to `expect: "holds"` and remove their `steps`. Turn its replay test into a test of the fixed behavior, or delete it. If a known finding's path changes for a correct reason, update `steps`.
5. Show that the check can still fail. Break the new code (remove a check, or move a save or a clear), mirror the break in the model, and confirm that the check reports `UNEXPECTED`. Then revert both.
6. Only after the model describes the code, set `sync-commit` below to the commit that you checked (`git rev-parse HEAD`). Add each new function that reads or writes the pointer to the list.
7. Edit the files under `claude-setup/skills/model-check-unshield-recovery/`, which git tracks. Then copy them to `.claude/skills/model-check-unshield-recovery/` with `cp -R`, or run `pnpm setup:claude`.

## Coverage record

The first line is the commit at which the model was last confirmed to describe this code. Each other line is a file and the functions in it that the check covers. `scripts/check.mjs` reads this block.

```coverage
sync-commit 5c7db5d58d634c2a32bc3a0d0361dde943ef0477
packages/sdk/src/token/wrapped-token.ts WrappedToken.unshield WrappedToken.unshieldAll WrappedToken.resumeUnshield WrappedToken.getPendingUnshield WrappedToken.#unwrap WrappedToken.unwrapAll WrappedToken.#finalizeUnwrap WrappedToken.#extractUnwrapRequestId WrappedToken.#isUnwrapRequestConsumed WrappedToken.#isPendingUnshieldConsumed WrappedToken.#clearStoredPendingUnshield WrappedToken.#finalizeUnshield
packages/sdk/src/token/pending-unshield.ts storageKey savePendingUnshield loadPendingUnshieldRequest clearPendingUnshield
packages/sdk/src/utils/submit-transaction.ts submitTransaction
packages/sdk/src/errors/unshield.ts isInvalidUnwrapRequestRevert
```
