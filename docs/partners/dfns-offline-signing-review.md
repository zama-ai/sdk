# Offline Signing — Review Brief for DFNS

**Audience:** DFNS engineering
**From:** Zama SDK team (`@zama-fhe/sdk`)
**Subject:** Review of the SDK's offline (deferred) signing pipeline — does it fit DFNS custody + policy approval?
**Status:** Draft for partner review
**Date:** 2026-06-19

---

## 1. Why we're sending you this

This brief is our follow-up to the feedback you gave us at EthCC 2026: the SDK signs
and broadcasts transactions atomically, but DFNS needs **prepare, sign, and broadcast
to be separate steps**. An unsigned transaction has to pass through your off-chain
policy engine — spending limits, whitelists, multi-party approval — before any
signature is produced, and the process that prepares a transaction is often not the
one that signs it (HSM-backed, air-gapped, human-in-the-loop). This is off-chain
governance over a single EOA, not a multisig.

Atomic signing simply can't accommodate that, so we built an **offline signing**
pipeline that splits every write into three independently-runnable phases:

```
prepare  →  sign  →  broadcast
(SDK)       (DFNS)     (SDK)
```

The policy-approval wait sits between `prepare` and `broadcast`, fully in the
application's control — the SDK never blocks inside a call waiting on your approval
ceremony.

We already have a working end-to-end integration against real DFNS + Sepolia (see
§6). This document asks you to validate our integration assumptions and the trust
boundary: does the pipeline fit DFNS custody and policy approval, and are the trust
decisions in §3 sound? The ★ questions in §7 are the ones we care most about.

---

## 2. The integration shape (what DFNS plugs into)

The canonical pattern configures the SDK **with no signer at all** — only a
read-only RPC provider. DFNS is the only component that touches keys.

```ts
// SDK is read-only: provider for RPC, no signer.
const config = createConfig({
  chains: [sepolia],
  relayers: { [sepolia.id]: node() },
  provider, // RPC only — used for nonce/fees/gas + broadcast + receipts
  storage: new MemoryStorage(),
});
const sdk = new ZamaSDK(config);

// 1. PREPARE — SDK builds an RLP-encoded unsigned EIP-1559 transaction.
const prepared = await sdk.offlineSigning.prepare({
  kind: "ConfidentialTransfer",
  from: dfnsWalletAddress,
  token,
  to,
  amount: 1_000000n,
});
// prepared.unsignedTx : 0x… (RLP, EIP-1559 / type-2)

// 2. SIGN — handed to DFNS; policy approval happens out-of-band here.
const { signedData } = await dfns.wallets.generateSignature({
  walletId,
  body: { kind: "Transaction", transaction: prepared.unsignedTx },
});
// …poll dfns.wallets.getSignature until status === "Signed"…

// 3. BROADCAST — SDK submits, awaits the receipt, syncs its caches.
const result = await sdk.offlineSigning.broadcast(prepared, signedData as Hex);
```

There are **two flows**, distinguished by what `prepare` returns:

| Flow                                                                              | `prepare` returns                                               | DFNS signs with       | Finalize with                                            |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------- | -------------------------------------------------------- |
| **Transaction** (transfers, operator approvals, shield/unshield legs, delegation) | `PreparedTransaction` with `unsignedTx` (RLP, EIP-1559)         | `kind: "Transaction"` | `sdk.offlineSigning.broadcast(prepared, signedTx)`       |
| **Credential permit** (FHE decrypt authorization — _not_ an on-chain tx)          | `PreparedCredentialPermit` with an EIP-712 `typedData` envelope | `kind: "Eip712"`      | `sdk.offlineSigning.registerPermit(prepared, signature)` |

The transaction kinds we support today (`TransactionKind`): `ConfidentialTransfer`,
`ConfidentialTransferFrom`, `SetOperator`, `Unwrap`, `UnwrapAll`, `FinalizeUnwrap`,
`ApproveUnderlying`, `Wrap`, `TransferAndCall`, `DelegateDecryption`,
`RevokeDelegation`. From DFNS's side they are all just EIP-1559 transactions — the
kind only affects how the SDK builds the calldata.

> **Note:** we deliberately did **not** ship a bundled "sign-and-broadcast" middle
> tier (where the SDK would call a custodian's combined sign+send endpoint). We
> expose only (a) in-process atomic signing for EOA/browser wallets, and (b) this
> fully phase-separated pipeline. We'd like to confirm the phase-separated surface
> is the right fit for DFNS rather than a combined call. **(Question Q7.)**

### Alternative: an in-process signer adapter

DFNS could instead be wrapped as an SDK signer adapter implementing
`signTransaction(unsignedTx) → signedBytes` and/or `signTypedData(typedData)`
(interface: `GenericSigner`, `packages/sdk/src/types/signer.ts`). We default to the
**signer-less** pattern above because it keeps the asynchronous policy-approval wait
in the application's control rather than buried inside an SDK call. We'd value your
opinion on which you'd prefer to support and document. **(Question Q8.)**

### 2.5 What DFNS acts on

The SDK only ever produces two artifacts DFNS must sign — an **RLP-encoded unsigned
EIP-1559 transaction** and a **standard EIP-712 typed-data envelope** — and consumes
back either **signed bytes**, a **broadcast tx hash**, or a **signature**. DFNS
handles both through `wallets.generateSignature`:

| SDK emits                   | DFNS signs with       | SDK finalizes with                                              |
| --------------------------- | --------------------- | --------------------------------------------------------------- |
| unsigned type-2 tx (RLP)    | `kind: "Transaction"` | `broadcast(prepared, signedTx)` _or_ `resume(prepared, txHash)` |
| EIP-712 typed-data envelope | `kind: "Eip712"`      | `registerPermit(prepared, signature)`                           |

Our working integration uses the **signed-bytes** path for transactions and the
**typed-data** path for permits (§6). The trust boundary that path implies is in §3.

---

## 3. Trust boundary — the two decisions we most want reviewed

These two are the crux of the security review. Both are documented as caveats in the
SDK's public API (`packages/sdk/src/namespaces/offline-signing.ts`).

### 3.1 `resume()` trusts the supplied transaction hash

If DFNS broadcasts the signed transaction itself (rather than returning raw bytes for
the SDK to broadcast), the application calls `resume(prepared, txHash)` so the SDK can
await the receipt and sync its caches. Today:

> **The SDK takes the caller's word that `txHash` corresponds to
> `prepared.unsignedTx`. No on-chain check confirms that the broadcaster signed
> _this_ payload rather than a different one from the same `from`.**

The SDK will emit success events and update cached balances based on a hash it never
verified against the prepared payload. We mitigate this by recommending the
**broadcast** path (DFNS returns signed bytes; the SDK broadcasts and therefore knows
the hash) over the **resume** path. But where DFNS must broadcast, we want to
understand the guarantee. **(Questions Q1, Q2.)**

### 3.2 `refresh()` produces a new payload identity

If the gap between `prepare` and signing is long (a slow approval ceremony), nonce/fee
values drift. `refresh(prepared)` re-stamps with current chain state. But:

> **Identity is not stable across refresh** — the returned `unsignedTx` bytes (and
> therefore the eventual tx hash) differ from the input's. Callers that key external
> approvals by the unsigned-tx bytes must treat the refreshed payload as a **new
> submission** and discard any pending approval against the prior one.

If DFNS's policy engine keys an approval request by the unsigned-tx payload, a refresh
invalidates a pending approval. How DFNS keys/dedupes approval requests determines
whether `refresh` is safe to use mid-approval or must only be called before submission.
**(Questions Q3, Q4.)**

### 3.3 `from`-address authority is not proven (signer-less path)

In the signer-less pattern, `request.from` is the sole declaration of which wallet
will sign. With a configured signer the SDK asserts `request.from` matches the signer's
connected address; with no signer that check is skipped — the SDK trusts that the
application points `from` at a wallet DFNS actually controls. We treat verifying control
of `from` as the application's responsibility. We'd like to confirm DFNS rejects
mismatches at sign time anyway (i.e. a signature request for an address the credential
doesn't control fails). **(Question Q5.)**

---

## 4. Nonce, fees, and transaction type

- **Nonce:** in `prepare`, the SDK reads the nonce with the **`"pending"`** block tag
  (`viem-provider.ts`, `ethers-provider.ts`) so multiple in-flight approvals against the
  same wallet don't all collide on a stale `"latest"` count. This narrows but does not
  eliminate the race when two `prepare` calls run truly concurrently against one wallet —
  both can read the same pending count before either broadcasts.
- **Override hook:** callers can pin `nonce`, `maxFeePerGas`, `maxPriorityFeePerGas`,
  and `gasLimit` via `OfflineSigningOptions`, skipping the RPC reads entirely — intended
  for custodians that own their own nonce manager. **(Questions Q6.)**
- **Transaction type:** unsigned transactions are always **EIP-1559 (type-2)**. We
  assume DFNS signs type-2 transactions for the wallet's chain and we never need
  legacy/EIP-2930. **(Question Q9.)**

---

## 5. EIP-712 envelope reshaping (permit flow)

For the credential-permit flow, `prepared.typedData` is a standard EIP-712 envelope,
but our working integration had to reshape it for the DFNS `Eip712` signing API:

- drop the `EIP712Domain` entry from `types` (DFNS supplies it);
- convert `domain.chainId` from `bigint` to `number`;
- forward `domain.name` / `version` / `verifyingContract` only when present.

(See `dfns.integration.test.ts` lines ~228–260.) This works, but we'd like to confirm
it's the intended normalization rather than a quirk we lucked into. **(Question Q10.)**

`prepared.typedData` can also be `null` — meaning the requested contracts are already
covered by an existing permit and **no signature is needed**. The application
short-circuits and skips DFNS entirely in that case.

---

## 6. What already works

`packages/sdk/src/services/__tests__/dfns.integration.test.ts` runs the full flow
against **real DFNS (with dashboard policy approval) + real Sepolia + the FHEVM
relayer**, for both flows:

1. `prepare → DFNS "Transaction" sign (await approval) → broadcast` — confirmed transfer.
2. `prepare → DFNS "Eip712" sign (await approval) → registerPermit` — confirmed permit.

It uses `@dfns/sdk` + `@dfns/sdk-keysigner` v0.8.21 with `AsymmetricKeySigner`. So the
question set below comes from a working integration, not a blank-page design.

---

## 7. Questions for DFNS

Grouped by topic; the ★ items are the ones we care most about.

### Trust & verification

- **Q1 ★** When DFNS returns a signed transaction (or broadcasts it), is the returned
  transaction hash authoritatively bound to the exact payload that was approved and
  signed? Could a different transaction from the same wallet (e.g. another in-flight
  approval) ever be what's actually on-chain under the hash we're handed?
- **Q2** Do you recommend we (a) take DFNS-returned **signed bytes** and broadcast them
  ourselves, or (b) have **DFNS broadcast** and return a hash we resume from? Which path
  do your customers typically use, and which gives the stronger payload↔hash guarantee?
- **Q5 ★** If we request a signature for a `from` address that the supplied credential
  doesn't control, does DFNS reject it? (We want to confirm `from` mismatch fails at your
  layer, not just ours.)

### Approval lifecycle & idempotency

- **Q3 ★** How does your policy engine **key / deduplicate** an approval request — by the
  unsigned-transaction bytes, by an external idempotency key we supply, by wallet+nonce,
  or by the eventual hash? This determines whether re-stamping nonce/fees mid-approval is
  safe.
- **Q4** If we re-stamp a transaction (new nonce/fees → new bytes/hash) after submitting
  it for approval, what's the correct way to **supersede** the prior pending approval —
  cancel + resubmit, or does a new request implicitly replace it?
- **Q11** Is there a recommended **idempotency key** mechanism so an application retry
  doesn't create a duplicate signing/approval request?

### Nonce management

- **Q6 ★** Do you expect **us** to assign nonces (we'd pin them via our override hook), or
  does DFNS own nonce assignment for a wallet? If DFNS manages nonces, should we omit the
  nonce entirely and let you fill it — and if so, how do we learn the value used (for
  receipt tracking)?

### Transaction format

- **Q9** Do you fully support **EIP-1559 (type-2)** signing for all the chains you custody
  for us? Any case where legacy / EIP-2930 is required?
- **Q10** For EIP-712 (`kind: "Eip712"`): is dropping `EIP712Domain` from `types` and
  passing `chainId` as a JS `number` the intended request shape? Any other normalization
  (e.g. address checksum, field ordering) we should apply?

### Integration model

- **Q7** Is a **fully phase-separated** `prepare → sign → broadcast` the right fit, or
  would you prefer we integrate against a combined sign+broadcast endpoint? (We chose
  phase separation so the async approval wait stays in the app's control.)
- **Q8** Would you rather we ship and document the **signer-less** pattern (SDK read-only,
  DFNS API called directly by the app) or a **DFNS signer adapter** inside the SDK
  (`signTransaction` / `signTypedData`)? Any preference for how partners surface DFNS?
- **Q15 ★** Your [**Offline Signer**](https://dfns.co/article/introducing-offline-signer)
  (air-gapped HSM: export a request bundle → physically transport it → sign in the HSM →
  import the signature back to DFNS for broadcast) reads as a long-latency instance of our
  `prepare → sign → broadcast` split, so we'd like to map it explicitly. Concretely:
  (a) does the offline path always **import-and-broadcast via DFNS** — meaning we'd use the
  weaker `resume(prepared, txHash)` path (§3.1) — or can the imported signature be returned
  to us as **signed bytes** to broadcast ourselves? (b) the air-gapped gap can be
  hours-to-days, so nonce/fee staleness and our `refresh()` re-stamping (§3.2, §4) bite
  hardest here — once a request bundle is exported for signing, can its nonce/fees still be
  updated, or is the exported payload frozen? (c) does Offline Signer sign **EIP-712
  typed-data** bundles (`kind: "Eip712"`) for our credential-permit flow, or
  transactions only?

### Operational

- **Q12** Recommended **polling** approach and intervals for awaiting approval status, and
  any **webhook/callback** alternative we should integrate instead of polling?
- **Q13** What's the canonical set of **terminal/failure** statuses and reasons we should
  surface to developers (rejection, timeout, expiry), and how should an app distinguish a
  policy rejection from a transient failure?
- **Q14** Any rate limits, batching guidance, or concurrency limits per wallet/org we
  should design around for high-volume confidential-token flows?

---

## 8. References (source of truth)

- Public API + caveats: `packages/sdk/src/namespaces/offline-signing.ts`
- Request / prepared types: `packages/sdk/src/types/offline.ts`
- Signer contract (for the adapter alternative): `packages/sdk/src/types/signer.ts`
- Provider contract (nonce/fees/broadcast): `packages/sdk/src/types/provider.ts`
- Working DFNS integration: `packages/sdk/src/services/__tests__/dfns.integration.test.ts`
