# Zama Compatibility Validation Harness — Technical Summary

## Background

The Zama SDK enables confidential token operations on EVM chains through Fully Homomorphic
Encryption (FHE). At the core of this flow is a credential authorization step (`sdk.allow()`)
that requires the user's wallet to sign an EIP-712 typed data payload. This signature is
submitted to the Zama relayer, which validates it and returns FHE keypair credentials tied
to the user's address.

The problem: this flow only works if the wallet's signing output is a **standard secp256k1
EIP-712 signature** — recoverable via `ecrecover`. Many modern wallet providers (MPC
custodians, smart contract wallets, threshold signing schemes) produce signatures that are
structurally different, or route transaction execution through higher-level APIs that do not
expose raw signing primitives. The compatibility surface is therefore non-trivial.

As Zama's ecosystem grows, infrastructure teams, custody providers, and wallet integrators
need a way to **validate compatibility before committing to a full integration**.

---

## Problem Statement

There is currently no standardized way for a third-party wallet provider to verify that
their signing stack is compatible with the Zama SDK. The alternative — attempting a
full SDK integration and discovering failures late — is costly and creates friction for
ecosystem adoption.

Specific failure modes that are non-obvious without testing:

- MPC wallets produce secp256k1 signatures but expose no raw transaction signing interface
- Smart contract wallets (ERC-1271) produce signatures that are valid on-chain but not
  recoverable via `ecrecover` — the SDK cannot use them for credential authorization
- Custody APIs may silently transform EIP-712 payloads (stripping or reordering fields),
  producing invalid signatures
- Async wallet initialization (address resolution via API) can create race conditions in
  synchronous test environments

---

## Approach

The harness is a self-contained TypeScript test suite (Vitest) with a single integration
point: a `Signer` interface that the integrator implements once. The interface is intentionally
minimal:

```ts
interface Signer {
  address: string;
  signTypedData(data): Promise<string>;   // required
  signTransaction?(tx): Promise<string>;  // optional — EOA path
  writeContract?(config): Promise<string>; // optional — MPC path
}
```

The integrator provides a file that exports a `signer` object satisfying this interface,
then points the harness to it via the `SIGNER_MODULE` environment variable — no source
modification required:

```bash
SIGNER_MODULE=./my-adapter.ts npm test
```

The harness intercepts `src/signer/index.ts` imports at the Vite alias layer and transparently
substitutes the custom adapter at test time.

### Test pipeline

Four tests run sequentially in a fixed order:

| # | Test | Section | Purpose |
|---|------|---------|---------|
| 1 | Signer Profile | (header) | Detect wallet type; never fails — diagnostic only |
| 2 | EIP-712 Signature | Ethereum | Verify secp256k1 recoverability via `ecrecover` |
| 3 | Transaction Execution | Ethereum | Sign + broadcast (EOA) or SKIP (MPC — writeContract path) |
| 4 | Zama SDK Flow | Zama | Execute `sdk.allow()` end-to-end against the live relayer |

### Verdict logic

The final compatibility verdict is determined **exclusively by the Zama SDK section**.
An Ethereum-level SKIP (e.g. an MPC wallet that cannot provide `signTransaction`) does
not affect the outcome. This reflects the actual requirement: the Zama SDK only needs
`signTypedData` to function; raw transaction signing is exercised separately through
the `writeContract` path during token operations.

### Pre-built adapters

The harness ships with a reference adapter for Crossmint MPC wallets, demonstrating the
expected integration pattern for custody providers. It serves both as a working example
and as a compatibility baseline.

---

## Issues Encountered (v1)

### Corporate proxy / TLS interception

Calls from the Crossmint adapter to `api.crossmint.com` fail in corporate network
environments where an HTTPS proxy intercepts traffic and presents its own certificate.
Node.js rejects this with `CERT_HAS_EXPIRED` or `UNABLE_TO_GET_ISSUER_CERT`. This is
an environmental issue, not a code defect, but it prevents the harness from running
end-to-end in such environments without setting `NODE_TLS_REJECT_UNAUTHORIZED=0`.

### BigInt serialization

EIP-712 messages may contain `uint256` fields represented as `BigInt` in JavaScript.
The Crossmint adapter passes these through `JSON.stringify`, which throws on `BigInt`
values. Fixed with a custom replacer, but this highlights a broader concern: adapters
must be careful about type mapping at the JS ↔ REST API boundary.

### Async address resolution race condition

MPC wallets that resolve their address via an API call (rather than deriving it from a
key) create a timing problem: `signer.address` is synchronous, but the resolution is
async. Solved via an exported `ready: Promise<void>` pattern awaited in `beforeAll`,
with a `.catch()` guard to prevent unhandled rejection warnings.

---

## Limitations

- **Sepolia only.** The harness is hardcoded to Sepolia testnet. There is no mainnet or
  Hoodi path.
- **No ERC-1271 validation.** Smart contract wallets are *detected* (via failed `ecrecover`)
  but not formally validated. The harness cannot currently call `isValidSignature()` to
  confirm ERC-1271 compatibility.
- **One adapter at a time.** A single `SIGNER_MODULE` is loaded per run. There is no
  batch mode for comparing multiple signers in one report.
- **Network dependency.** The Zama SDK Flow test requires live access to both an RPC node
  and the Zama relayer. Offline or air-gapped validation is not possible.
- **No machine-readable output.** The report is console-formatted only — no JSON or
  structured output for CI artifact consumption.

---

## v2 — What Would Make This Production-Ready

- **ERC-1271 validation path.** Call `isValidSignature(hash, sig)` on the wallet contract
  to formally verify smart account compatibility, classifying it as PASS rather than SKIP.
- **Multi-chain support.** Parameterize the network (Sepolia, Hoodi, mainnet) via
  environment variable, with corresponding relayer and registry addresses.
- **More reference adapters.** Turnkey, Privy, Openfort, Safe — each with a
  `COMPATIBILITY.md` documenting expected results and known limitations.
- **JSON report output.** Emit a `report.json` alongside the console output so CI systems
  can consume results programmatically (pass/fail gates, artifact uploads).
- **Retry and timeout configuration.** Expose `RELAYER_TIMEOUT` and `MAX_RETRIES` env vars
  to make the harness more resilient to network instability in CI environments.
- **Proxy-aware HTTP client.** Respect `HTTPS_PROXY` / `NO_PROXY` env vars so the harness
  works transparently in corporate network environments without disabling TLS verification.

---

## End Goal

The natural evolution of this harness is a zero-install compatibility check that any
wallet provider can run against their stack without cloning the repository:

```bash
npx @zama-fhe/check --signer ./my-signer.ts --network sepolia
```

Paired with a machine-readable report format, this could integrate into Zama's developer
portal as a self-service certification tool: a provider submits their adapter, runs the
harness in a sandboxed environment, and receives a compatibility badge they can display
in their documentation.

The end goal is to reduce the integration barrier for custody providers and wallet
infrastructure teams to near zero — making "does my wallet work with Zama?" a question
that can be answered in under five minutes, with a clear, actionable report when it cannot.
