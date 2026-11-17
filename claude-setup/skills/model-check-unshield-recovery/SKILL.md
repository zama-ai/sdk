---
name: model-check-unshield-recovery
description: "Exhaustively check, by running the real WrappedToken code under every interleaving of SDK calls, wallet, RPC, storage and chain events, that an interrupted two-phase unshield can always be found and resumed: WrappedToken.unshield/unshieldAll/resumeUnshield/getPendingUnshield and the zama:pending-unshield storage pointer. Use when a change touches those methods, pending-unshield.ts, submitTransaction, isInvalidUnwrapRequestRevert, or anything that reads or writes the pending-unshield pointer, or when asked whether an interrupted unshield can be lost."
---

# Model-check unshield recovery

An unshield is two transactions. `unwrap` burns the confidential amount and opens an unwrap request on the wrapper. `finalizeUnwrap` pays out the ERC-20 and deletes the request. Between the two, the SDK keeps one pointer in `sdk.storage` under `zama:pending-unshield:<wrapper>`, so that `getPendingUnshield()` can find an interrupted unshield and the app can offer `resumeUnshield()`. The unshield guide (`docs/gitbook/src/guides/unshield-tokens.md`, "Handle interrupted unshields") promises this.

**Harm when it breaks:** the user's confidential balance is burned, the ERC-20 never arrives, and the app shows no resume prompt. The request stays open on-chain, so only someone who digs out the unwrap transaction can finalize it.

The check is a vitest suite that runs the real `WrappedToken` code. Fakes replace the wallet, the RPC, the storage, the relayer and the chain. The explorer tries every order in which concurrent SDK calls and the chain can make progress, and every way each awaited call can end. There is no separate model to keep in sync with the code.

## The rules

| Rule                            | In plain words                                                                                                                                                                                                                                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PendingUnshieldIsDiscoverable` | When an unwrap request is open on-chain and no SDK call is still working on it, the pointer names an open request, so `getPendingUnshield()` returns its hash. Checked in every state.                                                                                                                          |
| `PointerKeptAfterSave`          | After `savePendingUnshield` writes the pointer for a request, the pointer stays until that request is finalized on-chain. Checked in every state.                                                                                                                                                               |
| `NoFalseAlreadyFinalized`       | The SDK reports "already finalized" (it throws `UnshieldAlreadyFinalizedError`, or `getPendingUnshield()` clears the pointer and returns `null`) only for a request that is finalized on-chain. If this breaks, the app tells the user that the funds arrived when they did not. Checked when an SDK call ends. |

## When to use this skill

Run the check when a change touches a function in the coverage list at the end of this file. Also run it when a change adds code that reads or writes the `zama:pending-unshield:` key, or changes how a finalize error is classified. Run it too when someone asks whether an interrupted unshield can be lost.

## Run

From the repo root, after `pnpm install`:

```sh
pnpm vitest run --config claude-setup/skills/model-check-unshield-recovery/explorer/vitest.config.mts
```

A run takes about 15 seconds. It needs no network. The suite has its own vitest config, so the root `pnpm test` does not run it.

## How it works

The files are in `explorer/`:

- `sdk-call.ts` builds a real `ZamaSDK` and `WrappedToken` with fake signer, provider, storage and relayer, and runs one SDK call against a script of answers.
- `world.ts` is the fake world: one storage and one wrapper on one chain. For each awaited call it lists every answer that the real dependency could give, the state in which each answer is possible, and what the answer changes. It also lists how the chain can mine each pending transaction.
- `explore.ts` is the scheduler: a breadth-first search over global states, the three rules, and the shortest paths.
- `unshield-recovery.test.ts` has the scenarios, the expected result for each rule, and the report.

An **actor** is one SDK call on the shared wrapper and storage: `unshield#1`, `unshieldAll#2`, or the `page load`. A **yield point** is an awaited call that touches shared state or that the flow depends on: `storage.get`, `storage.set`, `storage.delete`, `signer.writeContract`, `provider.waitForTransactionReceipt`, `provider.readContract(unwrapRequester)` and `relayer.decryptPublicValuesWithSignatures`. JavaScript runs nothing else between two awaits, so actors can interleave only at yield points.

One **step** is one of these:

- A pending call of one actor returns, with any value that the world allows.
- A pending call throws.
- The tab closes: the SDK call never resumes, but a transaction it already sent can still be mined.
- The page load starts.
- The chain mines one pending transaction.

Mining is a separate step, so "sent but not yet mined" and "mined after the caller gave up" are both reachable.

An actor's next call depends only on the answers it has had. So the explorer first runs the real code once for each answer sequence that an actor can get (the "real SDK runs" in the report). This gives one tree for each actor. Two tree nodes with equal subtrees count as one state. For example, `unwrapRequester` can return the requester or throw, and in both cases `#isUnwrapRequestConsumed` returns `false` and the code goes on the same way. The search then combines the trees with the world. It skips states it has seen, so the first path that breaks a rule is a shortest one.

## Read the result

Each scenario prints one header line with the number of states, steps and real SDK runs. Then it prints one line for each rule:

- `ok`: the rule holds in every reachable state of that scenario.
- `FINDING`: a known finding still breaks the rule, along the recorded shortest path. This is not a regression.
- `UNEXPECTED`: a rule that held now breaks, a known finding now holds, or a known finding's shortest path changed. The test fails and prints the path.
- `HarnessError`: the harness failed, not the SDK. For example, the code made a call that the fakes do not know, awaited something that the harness does not control, left a call pending without awaiting it, or behaved differently when replayed. Fix the harness before you trust any result.

A path is one step per line:

```text
 1. unshield#1: signer.writeContract(unwrap) -> sends U1
 2. unshield#1: provider.waitForTransactionReceipt(U1) throws (RPC timeout); unshield#1 ends: throws TransactionRevertedError
 3. chain: mines U1 -> req1 open
```

- `U1`, `U2` are the unwrap transactions that actor 1 and actor 2 send. `req1`, `req2` are the requests that they open.
- `F1`, `F2`, `F3` are the `finalizeUnwrap` transactions that `unshield#1`, `unshieldAll#2` and the page load send.
- `pointer(U1)` is the stored pending-unshield value for `U1`. `empty` means no value.
- `-> value` means the call returned that value. `ok` means it returned nothing.
- `; <actor> ends: ...` shows how the SDK call ended. `; getPendingUnshield() returns U1, ...` is a note from the page load.

**A real bug, or a harness error?** The SDK side of each step comes from the real code, so it can be wrong only if the scenario is wrong. The answers come from `world.ts`, and a harness error is a fake that behaves unlike the real wrapper, wallet, RPC, storage or relayer. For each step of the path, ask: could the real dependency give this answer in this state? Compare with `ERC7984ERC20WrapperUpgradeable` (under `contracts/dependencies/`), the `GenericSigner`, `GenericProvider` and `GenericStorage` contracts, and `submitTransaction`. A `throws Error (...)` or `throws TypeError (...)` at the end of an actor means that an error from a fake left the SDK call unchanged. Check that the real dependency throws like that. If every answer is realistic, it is a bug. Report it with the path in the code's words. Do not weaken a rule or a fake to make the check pass, and do not change product code unless the user asks you to.

## Known findings

Both findings break their rules on the current code, and the suite expects them.

1. **SDK-415, unsaved window** (`one unshield` and `two unshields` / `PendingUnshieldIsDiscoverable`). `unshield()` → `#unwrap` → `signer.writeContract` returns the unwrap hash → `provider.waitForTransactionReceipt` throws (an RPC timeout, or a wallet hash that the RPC never finds) → `unshield()` throws `TransactionRevertedError` before `#finalizeUnshield` reaches `savePendingUnshield` → the chain mines the unwrap anyway. The request is open, the storage is empty, and `getPendingUnshield()` returns `null`. A tab that closes during the receipt wait has the same effect. The guide says that the hash is saved "when phase 1 is submitted", but the code saves it only after the receipt.

   ```text
    1. unshield#1: signer.writeContract(unwrap) -> sends U1
    2. unshield#1: provider.waitForTransactionReceipt(U1) throws (RPC timeout); unshield#1 ends: throws TransactionRevertedError
    3. chain: mines U1 -> req1 open
   ```

2. **SDK-416, one pointer per wrapper** (`two unshields` / `PointerKeptAfterSave`, and `two unshields [phase 1 always saves]` / both rules). The key holds one request for each wrapper, with no account and no request id in it, and every clear deletes the key whatever it holds. A second save overwrites the first pointer while the first request is still open:

   ```text
    1. unshield#1: signer.writeContract(unwrap) -> sends U1
    2. unshieldAll#2: signer.writeContract(unwrap) -> sends U2
    3. chain: mines U1 -> req1 open
    4. unshield#1: provider.waitForTransactionReceipt(U1) -> success
    5. unshield#1: storage.set(pending-unshield, pointer(U1)) ok
    6. chain: mines U2 -> req2 open
    7. unshieldAll#2: provider.waitForTransactionReceipt(U2) -> success
    8. unshieldAll#2: storage.set(pending-unshield, pointer(U2)) ok
   ```

   With phase 1 always saving, the first unshield then stops (for example, the public decryption fails), the second one finalizes and clears the key, and req1 stays open with no pointer:

   ```text
    1-5. as above
    6. unshield#1: relayer.decryptPublicValuesWithSignatures(req1) throws (relayer unavailable); unshield#1 ends: throws DecryptionFailedError
    7. chain: mines U2 -> req2 open
    8. unshieldAll#2: provider.waitForTransactionReceipt(U2) -> success
    9. unshieldAll#2: storage.set(pending-unshield, pointer(U2)) ok
   10. unshieldAll#2: relayer.decryptPublicValuesWithSignatures(req2) ok
   11. unshieldAll#2: signer.writeContract(finalizeUnwrap req2) -> sends F2
   12. chain: mines F2 -> req2 finalized, ERC-20 paid out
   ```

   Two tabs, a second click, or two accounts in one browser reach the same state. So does a `getPendingUnshield()` or `resumeUnshield()` that clears a stale pointer after another call saved a new one.

## Bounds and assumptions

- **Scenarios.** One wrapper, one storage, one account. `one unshield` has `unshield(50n)` and one page load. `two unshields` has `unshield(50n)`, `unshieldAll()` and one page load. Each actor runs once. The page load starts at any step. It calls `getPendingUnshield()` and then `resumeUnshield(hash)` when that returns a hash, or it calls `resumeUnshield()` with any sent unwrap hash that the app kept. The two scenarios have about 2,000 and about 1.1 million distinct states.
- **Phase 1 always saves.** The `[phase 1 always saves]` variants forbid a throw or a tab close in an unshield call from the moment its unwrap is sent until `savePendingUnshield` returns. They keep finding 2 apart from finding 1, and they show that one unshield alone is safe once phase 1 always saves.
- **Answers** (`world.ts`):
  - `writeContract(unwrap)` sends the transaction, or the user rejects.
  - `writeContract(finalizeUnwrap)` on an open request sends, or the user rejects. On a request that is gone, the wallet's gas estimate throws `InvalidUnwrapRequest`, or a wallet that skips the estimate sends a transaction that reverts, or the user rejects.
  - A receipt returns only after the transaction is mined. A receipt wait can always throw.
  - A mined unwrap always opens its request. An unwrap that reverts or is dropped opens nothing, which is the same as a transaction that is never mined.
  - A mined finalize on an open request finalizes it and pays out, or reverts for another reason (bad proof, failed ERC-20 transfer) and leaves the request open. On a request that is gone, it reverts with `InvalidUnwrapRequest`.
  - `unwrapRequester` returns the requester while the request is open and zero once it is gone. A finalized request never reopens.
  - Storage reads and writes can throw. Each storage write is atomic.
  - Every yield point can also end with the tab closing.
- **Not yield points.** `provider.getChainId`, encryption, and the `confidentialBalanceOf` read in `unwrapAll` return at once. They touch no shared state. A throw there has the same effect as a throw before the unwrap is sent, or as a tab close at the next yield point.
- **Not covered.**
  - The low-level `unwrap` / `unwrapAll` / `finalizeUnwrap` used without `unshield()`. The guide says that those callers own the persistence.
  - Legacy hash-only pointers, and the receipt path in `#isPendingUnshieldConsumed` that they use.
  - A wallet that broadcasts the transaction and then throws, and transaction replacement (speed-up or cancel).
  - More than one wrapper or account. Unshield callbacks (none are passed).
  - React hooks and query invalidation, amounts and balances, and the relayer's decryption itself.
  - Liveness: that a stranded request is finalized in the end.

  A pass covers these bounds only.

## When a change to covered code is intended

1. Run the suite. The real code runs, so there is nothing to mirror by hand.
2. A `HarnessError` means that the change added a call that the fakes do not handle. Examples are a new chain read, a new storage key, or a provider method that is not faked. Add it to the `Call` type and the fakes in `sdk-call.ts`, and give it realistic answers in `options()` in `world.ts`. If it touches shared state, make it a yield point. Write the fake from the real dependency's behavior, not from what makes the check pass.
3. If a rule breaks `UNEXPECTED`, read the path step by step (see "A real bug, or a harness error?"). Change a rule only when the promise changed on purpose, and cite the evidence: the doc comment, the unshield guide, the tests, or the changelog.
4. If a fix removes a finding, its rows report `UNEXPECTED ... holds`. Set those rules to `"holds"` in `CASES` in `unshield-recovery.test.ts`, and delete path constants that nothing uses. If a known finding's shortest path changes for a correct reason (for example, a new yield point), confirm that it is the same bug, then update the recorded path.
5. Show that the check can still fail. Break the new code on purpose, for example in `#finalizeUnshield` make every `TransactionRevertedError` count as finalized elsewhere. Confirm that the suite reports `UNEXPECTED` for `NoFalseAlreadyFinalized` with a path that saves, has the finalize rejected, then clears the pointer and throws `UnshieldAlreadyFinalizedError` while the request is still open. Then revert, and confirm that `git diff packages/` is empty.
6. Edit the files under `claude-setup/skills/model-check-unshield-recovery/`, which git tracks. Then copy them to `.claude/skills/model-check-unshield-recovery/` with `cp -R`, or run `pnpm setup:claude`.

## Coverage

The explorer runs these functions. Run it when a change touches any of them.

- `packages/sdk/src/token/wrapped-token.ts`: `WrappedToken.unshield`, `unshieldAll`, `resumeUnshield`, `getPendingUnshield`, `#unwrap`, `unwrapAll`, `#finalizeUnshield`, `#finalizeUnwrap`, `#extractUnwrapRequestId`, `#isUnwrapRequestConsumed`, `#isPendingUnshieldConsumed`, `#clearStoredPendingUnshield`
- `packages/sdk/src/token/pending-unshield.ts`: `savePendingUnshield`, `loadPendingUnshieldRequest`, `clearPendingUnshield`
- `packages/sdk/src/utils/submit-transaction.ts`: `submitTransaction`
- `packages/sdk/src/errors/unshield.ts`: `isInvalidUnwrapRequestRevert`
- On the way: `Decryption.decryptPublicValues`, `requireAlignedWalletAccount`, `swallow`, `findUnwrapRequested`
