# Zama Compatibility Validation Harness — Summary V2

## 1) Context: Why This Harness Matters

Teams integrating Zama SDK need a reliable answer to:

> Is our signing/execution system actually compatible with Zama flows?

This is difficult because real integrations are heterogeneous:

- EOA wallets,
- MPC systems,
- API-routed custody systems,
- smart-account / ERC-1271 models.

Without a dedicated compatibility harness, teams typically discover issues late, during full integration. This causes:

- slow diagnosis,
- confusion between infra errors and real incompatibilities,
- weak or overconfident compatibility claims.

This project solves that by providing a conservative, evidence-driven validation process before full integration work.

## 2) Problem and Solution in One Page

### Problem addressed

- Integrators do not expose the same primitives.
- A pass/fail-only model is misleading.
- Zama compatibility can be partial (for example: authorization works, write path not validated).

### Solution implemented

The harness uses an adapter model and evaluates multiple surfaces with explicit statuses:

- `PASS`, `FAIL`, `UNTESTED`, `UNSUPPORTED`, `BLOCKED`, `INCONCLUSIVE`.

It separates:

- compatibility failures (adapter/signer behavior),
- infrastructure blockers (RPC, relayer, registry, environment).

It outputs a scoped final claim, plus:

- `Confidence` (`HIGH`/`MEDIUM`/`LOW`),
- `Write Validation Depth` (`FULL`/`PARTIAL`/`UNTESTED`).

## 3) What “Compatible” Means in This Harness

The harness intentionally avoids vague “compatible/incompatible” statements.

Practical compatibility levels:

1. Authorization-compatible:
   - authorization flow validated,
   - recoverability semantics acceptable for the tested model,
   - write surface may still be partial or untested.
2. Authorization + write compatible:
   - authorization validated,
   - write flow validated with stronger evidence (`write depth` and overall claim).

If evidence is incomplete, the harness keeps the verdict partial or inconclusive.

## 4) Exact Integrator Workflow

### Step 1: Setup

```bash
git clone <repo>
cd examples/compatibility-harness
npm install
cp .env.example .env
```

### Step 2: Choose and generate adapter template

Template selection:

- choose `eoa` if your system exposes standard EOA signing/execution.
- choose `mpc` if signatures are ECDSA but raw tx signing is not exposed.
- choose `api-routed` if execution happens through provider APIs.
- choose `generic` if uncertain.

Generate:

```bash
npm run init:adapter -- --template <eoa|mpc|api-routed|generic> --output ./examples/my-provider/signer.ts
```

### Step 3: Implement the generated adapter

Required fields/methods to fill:

1. `metadata.name`
2. `metadata.declaredArchitecture`
3. `metadata.verificationModel`
4. `capabilities` (honest declaration: `SUPPORTED`/`UNSUPPORTED`/`UNKNOWN`)
5. `getAddress()`
6. `signTypedData()` when supported
7. `writeContract()` when supported

Minimal adapter shape:

```ts
export const adapter: Adapter = {
  metadata: { ... },
  capabilities: { ... },
  async getAddress() { ... },
  async signTypedData(data) { ... },
  async writeContract(config) { ... },
};
```

### Step 4: Implement methods by architecture (required vs optional)

| Architecture           | Required methods                                                         | Usually optional                                                                   |
| ---------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `EOA`                  | `getAddress`, `signTypedData`, `writeContract`                           | `signTransaction`, `readContract`, `waitForTransactionReceipt`                     |
| `MPC`                  | `getAddress`, `signTypedData`, `writeContract`                           | `signTransaction` (often unsupported), `readContract`, `waitForTransactionReceipt` |
| `API_ROUTED_EXECUTION` | `getAddress`, `writeContract` (+ `signTypedData` if auth flow supported) | `signTransaction` (often unsupported), `readContract`, `waitForTransactionReceipt` |
| `SMART_ACCOUNT`        | `getAddress`, execution methods exposed by your system                   | `signTransaction` depends on model; `signTypedData` may be provider-managed        |

### Step 5: Fill `.env`

Minimum checklist:

- provider credentials required by your adapter,
- `RPC_URL` for your target chain,
- `RELAYER_URL` if required by your network/profile,
- funded account when writes are tested,
- optional `REPORT_JSON_PATH` if you want a saved artifact path.

If `doctor` reports invalid/missing config, fix `.env` first and rerun.

### Step 6: Run commands in order

```bash
SIGNER_MODULE=./examples/my-provider/signer.ts npm run adapter:check
SIGNER_MODULE=./examples/my-provider/signer.ts npm run doctor
SIGNER_MODULE=./examples/my-provider/signer.ts npm test
SIGNER_MODULE=./examples/my-provider/signer.ts npm run validate
```

Strict gate for authorization + write:

```bash
VALIDATION_TARGET=AUTHORIZATION_AND_WRITE SIGNER_MODULE=./examples/my-provider/signer.ts npm run validate
```

## 5) How To Read Results (Simple)

Read in this order:

1. `Final`
2. `Claim`
3. `Confidence`
4. `Write Validation Depth`
5. per-check failures and root-cause category

### Compact output example

```text
Adapter Initialization                PASS
Address Resolution                    PASS
EIP-712 Signing                       PASS
EIP-712 Recoverability                PASS
Raw Transaction Execution             UNSUPPORTED
Zama Authorization Flow               PASS
Zama Write Flow                       PASS
Final: ZAMA COMPATIBLE FOR AUTHORIZATION AND WRITE FLOWS
Write Validation Depth: FULL
Confidence: HIGH
Claim: ZAMA_AUTHORIZATION_AND_WRITE_COMPATIBLE
```

Interpretation: strong evidence for auth+write compatibility in the tested environment, with raw tx unsupported by design.

## 6) Post-Run Decision Tree

1. If `Final` is authorization/write compatible and confidence is acceptable:
   - proceed to integration pilot scope.
2. If `FAIL` occurs on signer/adapter checks:
   - fix adapter implementation or provider integration behavior.
3. If `BLOCKED`/`INCONCLUSIVE` due to infra:
   - fix environment/RPC/relayer/registry and rerun before concluding.
4. If result is partial (`UNSUPPORTED`/`UNTESTED`):
   - keep claim scoped; do not communicate full compatibility.

## 7) Common Failure Patterns and Next Action

| Pattern                             | Typical cause                                               | Action                                                     |
| ----------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------- |
| `Address Resolution = BLOCKED`      | invalid/missing credentials or address config               | fix `.env`, rerun `doctor`                                 |
| `EIP-712 Signing = FAIL`            | signer implementation not matching expected typed-data flow | fix adapter signing method and payload mapping             |
| `Recoverability = FAIL`             | non-recoverable or malformed signature for tested model     | verify signature format and verification model assumptions |
| `Zama Authorization = INCONCLUSIVE` | relayer/RPC/registry outage                                 | stabilize infra, rerun                                     |
| `Zama Write = PARTIAL/UNTESTED`     | write path unsupported or not fully observed                | implement/enable write flow or keep scoped claim           |
| `validate` exits `30`               | inconclusive authorization evidence                         | treat as blocked validation, not incompatibility           |

## 8) Current Boundaries

This harness is strong for integration diagnostics, but it is not:

- a global permanent certification authority,
- a guarantee of all possible SDK/runtime paths,
- a frontend UX/session lifecycle validation tool.

## 9) What To Share With Zama For Review

When asking Zama for technical review, share:

1. final claim (`Claim` + `Final` line),
2. confidence level,
3. write validation depth,
4. list of non-pass checks with root-cause categories,
5. adapter metadata and declared capabilities,
6. command context (network/profile, key env settings, date of run).

This enables fast, reproducible partner-level discussions.

## 10) References

Reference adapter implementations are available in:

- `examples/crossmint/signer.ts`
- `examples/turnkey/signer.ts`
- `examples/openfort/signer.ts`

They are examples for guidance, not normative requirements.
