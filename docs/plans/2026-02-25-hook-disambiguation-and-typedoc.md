# Hook Disambiguation & TypeDoc Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate hook naming confusion with a decision-tree in the react-sdk README, and set up TypeDoc so API docs are generated from source instead of hand-maintained.

**Architecture:** Two independent workstreams — (1) a docs-only README section with comparison table, (2) TypeDoc config + `pnpm docs` script + TSDoc annotations on core SDK public methods.

**Tech Stack:** TypeDoc 0.27+, Markdown, TSDoc annotations.

---

### Task 1: Add "Which hooks should I use?" section to react-sdk README

**Files:**

- Modify: `packages/react-sdk/README.md` (insert after line 157, the `</ZamaProvider>` closing of Provider Setup)

**Step 1: Add the section**

Insert the following after the Provider Setup section (after the `</ZamaProvider>;` code block, before `## Hooks Reference`):

````markdown
## Which Hooks Should I Use?

The React SDK exports hooks from two layers. **Pick one layer per operation — never mix them.**

**Use the main import** (`@zama-fhe/react-sdk`) when you have a `ZamaProvider` in your component tree. These hooks handle FHE encryption, cache invalidation, and error wrapping automatically:

```tsx
import { useShield, useConfidentialTransfer } from "@zama-fhe/react-sdk";

const { mutateAsync: shield } = useShield({ tokenAddress });
await shield({ amount: 1000n }); // encryption + approval handled for you
```
````

**Use the library sub-path** (`/viem`, `/ethers`, `/wagmi`) when you need direct contract-level control without a provider. You handle encryption and cache management yourself:

```tsx
import { useShield } from "@zama-fhe/react-sdk/viem";

const { mutateAsync: shield } = useShield();
await shield({ client: walletClient, wrapperAddress, to, amount }); // raw contract call
```

### Comparison of Colliding Hook Names

Five hooks share names across both layers. Here's how they differ:

| Hook                      | Main (`@zama-fhe/react-sdk`)                                | Sub-path (`/viem`, `/ethers`, `/wagmi`)                                              |
| ------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `useConfidentialTransfer` | `mutate({ to, amount })` — auto-encrypts                    | `mutate({ client, token, to, handle, inputProof })` — pre-encrypted                  |
| `useShield`               | `mutate({ amount, approvalStrategy? })` — auto-approves     | `mutate({ client, wrapper, to, amount })` — raw wrap call                            |
| `useShieldETH`            | `mutate({ amount, value? })` — `value` defaults to `amount` | `mutate({ client, wrapper, to, amount, value })` — all fields required               |
| `useUnwrap`               | `mutate({ amount })` — auto-encrypts                        | `mutate({ client, token, from, to, encryptedAmount, inputProof })` — pre-encrypted   |
| `useFinalizeUnwrap`       | `mutate({ burnAmountHandle })` — fetches proof from relayer | `mutate({ client, wrapper, burntAmount, cleartext, proof })` — caller provides proof |

| Feature                 | Main                    | Sub-path                      |
| ----------------------- | ----------------------- | ----------------------------- |
| Requires `ZamaProvider` | Yes                     | No                            |
| FHE encryption          | Automatic               | Manual (caller pre-encrypts)  |
| ERC-20 approval         | Automatic (`useShield`) | None                          |
| Cache invalidation      | Automatic               | None                          |
| Return type             | `TransactionResult`     | Raw tx hash or wagmi mutation |

> **Rule of thumb:** If you're building a standard dApp UI, use the main import. If you're building custom transaction pipelines or need to compose with other wagmi hooks at the contract level, use the sub-path.

````

**Step 2: Verify the README renders correctly**

Run: `head -220 packages/react-sdk/README.md | tail -80`
Expected: The new section appears between Provider Setup and Hooks Reference.

**Step 3: Commit**

```bash
git add packages/react-sdk/README.md
git commit -m "docs(react-sdk): add hook disambiguation guide with comparison table"
````

---

### Task 2: Install TypeDoc

**Files:**

- Modify: `package.json` (add `typedoc` to devDependencies and `docs` script)

**Step 1: Install typedoc**

Run: `pnpm add -Dw typedoc`

**Step 2: Add docs script to root package.json**

Add to the `scripts` section:

```json
"docs": "typedoc"
```

**Step 3: Verify installation**

Run: `pnpm typedoc --version`
Expected: Version 0.27.x or higher.

**Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "build: install typedoc for API docs generation"
```

---

### Task 3: Configure TypeDoc

**Files:**

- Create: `typedoc.json`
- Modify: `.gitignore` (add `docs/api/`)

**Step 1: Create typedoc.json**

```json
{
  "$schema": "https://typedoc.org/schema.json",
  "entryPoints": [
    "packages/sdk/src/index.ts",
    "packages/sdk/src/viem/index.ts",
    "packages/sdk/src/ethers/index.ts",
    "packages/sdk/src/node/index.ts",
    "packages/react-sdk/src/index.ts",
    "packages/react-sdk/src/viem/index.ts",
    "packages/react-sdk/src/ethers/index.ts",
    "packages/react-sdk/src/wagmi/index.ts"
  ],
  "entryPointStrategy": "expand",
  "out": "docs/api",
  "name": "Zama Confidential Token SDK",
  "readme": "none",
  "excludePrivate": true,
  "excludeInternal": true,
  "excludeExternals": true,
  "tsconfig": "tsconfig.json",
  "skipErrorChecking": true,
  "categorizeByGroup": true
}
```

Note: `skipErrorChecking: true` is needed because the tsconfig uses `noEmit: true` and `moduleResolution: "bundler"` — TypeDoc may encounter resolution issues with peer deps (viem, ethers, wagmi) that aren't always installed. This lets it still generate docs for what it can resolve.

**Step 2: Add docs/api/ to .gitignore**

Append to `.gitignore`:

```
# generated api docs
docs/api/
```

**Step 3: Test doc generation**

Run: `pnpm docs`
Expected: HTML output generated in `docs/api/` directory without errors (warnings about unresolved external types are OK).

**Step 4: Verify output exists**

Run: `ls docs/api/index.html`
Expected: File exists.

**Step 5: Commit**

```bash
git add typedoc.json .gitignore
git commit -m "build: configure typedoc for multi-package API doc generation"
```

---

### Task 4: Add @packageDocumentation to entry points

**Files:**

- Modify: `packages/sdk/src/index.ts` (add module doc at top)
- Modify: `packages/sdk/src/viem/index.ts`
- Modify: `packages/sdk/src/ethers/index.ts`
- Modify: `packages/sdk/src/node/index.ts`
- Modify: `packages/react-sdk/src/index.ts`
- Modify: `packages/react-sdk/src/viem/index.ts`
- Modify: `packages/react-sdk/src/ethers/index.ts`
- Modify: `packages/react-sdk/src/wagmi/index.ts`

**Step 1: Add module-level JSDoc to each entry point**

Prepend each file with a `@packageDocumentation` block. The content should describe the sub-path. Examples:

`packages/sdk/src/index.ts`:

```ts
/**
 * Core SDK for confidential token operations using Fully Homomorphic Encryption.
 *
 * Main classes: {@link ZamaSDK}, {@link Token}, {@link ReadonlyToken}, {@link RelayerWeb}.
 *
 * @packageDocumentation
 */
```

`packages/sdk/src/viem/index.ts`:

```ts
/**
 * Viem adapter for `@zama-fhe/sdk` — provides {@link ViemSigner} and
 * viem-native contract read/write helpers.
 *
 * @packageDocumentation
 */
```

`packages/sdk/src/ethers/index.ts`:

```ts
/**
 * Ethers adapter for `@zama-fhe/sdk` — provides {@link EthersSigner} and
 * ethers-native contract read/write helpers.
 *
 * @packageDocumentation
 */
```

`packages/sdk/src/node/index.ts`:

```ts
/**
 * Node.js backend for `@zama-fhe/sdk` — provides {@link RelayerNode},
 * {@link NodeWorkerClient}, and {@link NodeWorkerPool} for server-side FHE operations.
 *
 * @packageDocumentation
 */
```

`packages/react-sdk/src/index.ts`:

```ts
/**
 * React hooks for confidential token operations, built on React Query.
 *
 * Requires {@link ZamaProvider} in the component tree. Re-exports all public
 * symbols from `@zama-fhe/sdk`.
 *
 * @packageDocumentation
 */
```

`packages/react-sdk/src/viem/index.ts`:

```ts
/**
 * Viem-specific React hooks for low-level contract interactions.
 *
 * These hooks do NOT require {@link ZamaProvider} — they operate directly
 * through viem `PublicClient` and `WalletClient`.
 *
 * @packageDocumentation
 */
```

`packages/react-sdk/src/ethers/index.ts`:

```ts
/**
 * Ethers-specific React hooks for low-level contract interactions.
 *
 * These hooks do NOT require {@link ZamaProvider} — they operate directly
 * through ethers `Provider` and `Signer`.
 *
 * @packageDocumentation
 */
```

`packages/react-sdk/src/wagmi/index.ts`:

```ts
/**
 * Wagmi-specific React hooks for low-level contract interactions.
 *
 * These hooks do NOT require {@link ZamaProvider} — they operate through
 * wagmi's `Config` and `useWriteContract`.
 *
 * @packageDocumentation
 */
```

**Step 2: Verify TypeDoc picks them up**

Run: `pnpm docs`
Expected: Module descriptions appear in the generated HTML.

**Step 3: Run lint and typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: No new errors.

**Step 4: Commit**

```bash
git add packages/sdk/src/index.ts packages/sdk/src/viem/index.ts packages/sdk/src/ethers/index.ts packages/sdk/src/node/index.ts packages/react-sdk/src/index.ts packages/react-sdk/src/viem/index.ts packages/react-sdk/src/ethers/index.ts packages/react-sdk/src/wagmi/index.ts
git commit -m "docs: add @packageDocumentation to all entry points"
```

---

### Task 5: Add @param/@returns to ZamaSDK methods

**Files:**

- Modify: `packages/sdk/src/token/zama-sdk.ts`

**Step 1: Add @param and @returns tags to all public methods**

Update the JSDoc blocks:

`createReadonlyToken`:

```ts
/**
 * Create a read-only interface for a confidential token.
 * Supports balance queries and authorization without a wrapper address.
 *
 * @param address - The confidential token contract address.
 * @returns A {@link ReadonlyToken} instance bound to this SDK's relayer, signer, and storage.
 */
```

`createToken`:

```ts
/**
 * Create a high-level ERC-20-like interface for a confidential token.
 * Includes write operations (transfer, shield, unshield).
 *
 * @param address - The confidential token contract address (also used as wrapper by default).
 * @param wrapper - Optional explicit wrapper address, if it differs from the token address.
 * @returns A {@link Token} instance bound to this SDK's relayer, signer, and storage.
 */
```

`terminate`: No params, so just add `@returns`:

```ts
/**
 * Terminate the relayer backend and clean up resources.
 * Call this when the SDK is no longer needed (e.g. on unmount or shutdown).
 */
```

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: No new errors.

**Step 3: Commit**

```bash
git add packages/sdk/src/token/zama-sdk.ts
git commit -m "docs: add @param/@returns to ZamaSDK public methods"
```

---

### Task 6: Add @param/@returns to Token methods

**Files:**

- Modify: `packages/sdk/src/token/token.ts`

**Step 1: Add @param and @returns tags to all public methods**

Update each JSDoc block to include `@param` and `@returns`. The existing descriptions and `@example` blocks stay — just add the missing tags below the description.

`confidentialTransfer`:

```ts
 * @param to - Recipient address.
 * @param amount - Plaintext amount to transfer (encrypted automatically via FHE).
 * @returns The transaction hash and mined receipt.
 * @throws {@link EncryptionFailedError} if FHE encryption fails.
 * @throws {@link TransactionRevertedError} if the on-chain transfer reverts.
```

`confidentialTransferFrom`:

```ts
 * @param from - The address to transfer from (caller must be an approved operator).
 * @param to - Recipient address.
 * @param amount - Plaintext amount to transfer (encrypted automatically via FHE).
 * @returns The transaction hash and mined receipt.
 * @throws {@link EncryptionFailedError} if FHE encryption fails.
 * @throws {@link TransactionRevertedError} if the on-chain transfer reverts.
```

`approve`:

```ts
 * @param spender - The address to approve as an operator.
 * @param until - Optional Unix timestamp for approval expiry. Defaults to now + 1 hour.
 * @returns The transaction hash and mined receipt.
 * @throws {@link ApprovalFailedError} if the approval transaction fails.
```

`isApproved`:

```ts
 * @param spender - The address to check operator approval for.
 * @returns `true` if the spender is an approved operator for the connected wallet.
```

`shield`:

```ts
 * @param amount - The plaintext amount to shield.
 * @param options - Optional configuration.
 * @param options.approvalStrategy - `"exact"` (default), `"max"`, or `"skip"`.
 * @param options.fees - Optional fee amount to add to the ETH value (for native ETH wrappers).
 * @returns The transaction hash and mined receipt.
 * @throws {@link ApprovalFailedError} if the ERC-20 approval step fails.
 * @throws {@link TransactionRevertedError} if the shield transaction reverts.
```

`shieldETH`:

```ts
 * @param amount - The amount of ETH to shield (in wei).
 * @param value - Optional ETH value to send. Defaults to `amount`.
 * @returns The transaction hash and mined receipt.
 * @throws {@link TransactionRevertedError} if the shield transaction reverts.
```

`unwrap`:

```ts
 * @param amount - The plaintext amount to unwrap (encrypted automatically).
 * @returns The transaction hash and mined receipt.
 * @throws {@link EncryptionFailedError} if FHE encryption fails.
 * @throws {@link TransactionRevertedError} if the unwrap transaction reverts.
```

`unwrapAll`:

```ts
 * @returns The transaction hash and mined receipt.
 * @throws {@link DecryptionFailedError} if the balance is zero.
 * @throws {@link TransactionRevertedError} if the unwrap transaction reverts.
```

`unshield`:

```ts
 * @param amount - The plaintext amount to unshield.
 * @param callbacks - Optional progress callbacks for each phase.
 * @returns The finalize transaction hash and mined receipt.
 * @throws {@link EncryptionFailedError} if FHE encryption fails.
 * @throws {@link TransactionRevertedError} if any transaction in the flow reverts.
```

`unshieldAll`:

```ts
 * @param callbacks - Optional progress callbacks for each phase.
 * @returns The finalize transaction hash and mined receipt.
 * @throws {@link DecryptionFailedError} if the balance is zero.
 * @throws {@link TransactionRevertedError} if any transaction in the flow reverts.
```

`resumeUnshield`:

```ts
 * @param unwrapTxHash - The transaction hash of the previously submitted unwrap.
 * @param callbacks - Optional progress callbacks.
 * @returns The finalize transaction hash and mined receipt.
 * @throws {@link TransactionRevertedError} if finalization fails.
```

`finalizeUnwrap`:

```ts
 * @param burnAmountHandle - The encrypted amount handle from the `UnwrapRequested` event.
 * @returns The transaction hash and mined receipt.
 * @throws {@link DecryptionFailedError} if public decryption fails.
 * @throws {@link TransactionRevertedError} if the finalize transaction reverts.
```

`approveUnderlying`:

```ts
 * @param amount - Optional approval amount. Defaults to max uint256.
 * @returns The transaction hash and mined receipt.
 * @throws {@link ApprovalFailedError} if the approval transaction fails.
```

**Step 2: Run lint and typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: No new errors.

**Step 3: Commit**

```bash
git add packages/sdk/src/token/token.ts
git commit -m "docs: add @param/@returns/@throws to Token public methods"
```

---

### Task 7: Add @param/@returns to ReadonlyToken methods

**Files:**

- Modify: `packages/sdk/src/token/readonly-token.ts`

**Step 1: Read the file to identify all public methods**

Run: `grep -n 'async \|^\s*static' packages/sdk/src/token/readonly-token.ts`

**Step 2: Add @param and @returns tags**

Follow the same pattern as Task 6. Key methods:

- `balanceOf(owner?)` — `@param owner`, `@returns` bigint
- `confidentialBalanceOf(owner?)` — `@param owner`, `@returns` hex handle
- `decryptBalance(handle, owner?)` — `@param handle`, `@param owner`, `@returns` bigint
- `decryptHandles(handles, owner?)` — `@param handles`, `@param owner`, `@returns` Record
- `authorize()` — `@returns` void
- `authorizeAll(tokens)` — `@param tokens`, `@returns` void (static)
- `batchDecryptBalances(tokens, options?)` — `@param tokens`, `@param options`, `@returns` Map (static)
- `isConfidential()` — `@returns` boolean
- `isWrapper()` — `@returns` boolean
- `discoverWrapper(coordinatorAddress)` — `@param coordinatorAddress`, `@returns` Address or null
- `underlyingToken()` — `@returns` Address
- `allowance(wrapper, owner?)` — `@param wrapper`, `@param owner`, `@returns` bigint
- `name()`, `symbol()`, `decimals()` — `@returns` string/number

**Step 3: Run lint and typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: No new errors.

**Step 4: Commit**

```bash
git add packages/sdk/src/token/readonly-token.ts
git commit -m "docs: add @param/@returns to ReadonlyToken public methods"
```

---

### Task 8: Regenerate docs and verify

**Step 1: Run full doc generation**

Run: `pnpm docs`
Expected: Clean generation with HTML output in `docs/api/`.

**Step 2: Spot-check the output**

Run: `grep -l 'confidentialTransfer\|shield\|balanceOf' docs/api/*.html docs/api/**/*.html | head -5`
Expected: Multiple HTML files reference key methods.

**Step 3: Run full test suite to confirm nothing broke**

Run: `pnpm test:run`
Expected: All tests pass.

**Step 4: Run lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: No errors.
