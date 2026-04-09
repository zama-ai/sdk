# Zama Compatibility Validation Harness — Summary V2

## 1) Purpose of This Document

This document explains what the Compatibility Harness is, why it exists, and what it can reliably validate today.

Target audience:

- Zama SDK engineers,
- partner solutions engineers,
- external integrator teams (wallet, custody, infra) evaluating compatibility.

Goal of this version:

- provide a clear, functional view of the product,
- avoid overclaiming,
- make review and adoption easier for technical peers.

## 2) Context and Problem

Integrators ask one practical question:

> Is our signing and execution system compatible with the Zama SDK?

This is hard to answer because real systems are heterogeneous:

- EOA wallets,
- MPC-backed wallets,
- API-routed custody systems,
- smart-account based systems.

A binary pass/fail model is not enough. A system can fail one Ethereum primitive (for example raw transaction signing) and still be compatible with the Zama flow that matters in practice.

The harness exists to provide a conservative answer based on observed evidence, not assumptions.

## 3) Product Approach: The Compatibility Harness

The harness uses an adapter model instead of a signer-only model.

Each adapter declares metadata and capabilities, then the harness runs checks across four layers:

1. Identity and verification
2. Ethereum execution primitives
3. Adapter-routed execution
4. Zama SDK flows (authorization and write probe)

Each check is reported with a status:

- `PASS`
- `FAIL`
- `UNTESTED`
- `UNSUPPORTED`
- `BLOCKED`
- `INCONCLUSIVE`

The final verdict is scoped. The harness avoids generic claims like "compatible" when evidence is partial or blocked.

## 4) Integrator Journey: How to Validate Compatibility

This is the intended path for an external integrator.

### Step 1: Setup

```bash
git clone <repo>
cd examples/compatibility-harness
npm install
cp .env.example .env
```

### Step 2: Provide an adapter

Use either:

- one of the provided examples (`crossmint`, `turnkey`, `openfort`), or
- a custom adapter generated with:

```bash
npm run init:adapter
```

### Step 3: Run quick preflight checks

```bash
npm run adapter:check
npm run doctor
```

These commands validate adapter shape and environment readiness before live validation.
If they report `BLOCKED` or `INCONCLUSIVE`, fix environment/infrastructure first.

### Step 4: Run compatibility validation

```bash
npm test
npm run validate
```

`validate` returns CI-friendly exit codes tied to compatibility claims.

For deterministic local checks without live infra dependencies:

```bash
HARNESS_MOCK_MODE=1 npm test
HARNESS_MOCK_MODE=1 npm run validate
```

### Step 5: Read the result by sections

Report sections are:

- Adapter Profile
- Ethereum Compatibility
- Adapter-Routed Execution
- Zama SDK Compatibility
- Infrastructure / Environment
- Final Verdict

Interpretation rule:

- if infra is failing, treat the run as blocked/inconclusive,
- do not classify the adapter as incompatible unless compatibility checks actually fail.

### Real example: Turnkey

Turnkey can be validated with:

```bash
npm run adapter:check:turnkey
npm run doctor:turnkey
npm run test:turnkey
npm run validate:turnkey
```

Expected pattern for a healthy Turnkey run:

- EIP-712 verification passes,
- raw transaction signing may be `UNSUPPORTED` by design,
- Zama authorization passes,
- Zama write probe passes when infrastructure is healthy,
- final verdict can still be positive for the validated Zama surface even without raw EOA tx signing.

## 5) What the Harness Can Validate Today

Current strong value:

- checks that matter for real SDK integration decisions,
- conservative claim generation from check evidence,
- separation of compatibility failures from infra/environment failures,
- repeatable local and CI usage (`test`, `validate`, deterministic mock mode).

Concretely, depending on adapter support, it can validate:

- address resolution,
- EIP-712 signature flow and recoverability,
- raw tx signing/execution (when supported),
- adapter-routed writes and reads,
- Zama authorization flow (`sdk.allow()`),
- practical write-path probe with on-chain verification.

Typical claim outcomes include:

- authorization and write compatible,
- authorization compatible with write flow not validated/supported,
- inconclusive because infrastructure or environment blocked execution.

## 6) Current Limits and Non-Goals

Current limits:

- not a global or final certification authority,
- not exhaustive across every SDK path and every network condition,
- mainnet profile is available but still marked experimental,
- smart-account / ERC-1271 coverage is useful but not a full certification matrix,
- it does not validate embedded frontend session/auth UX (for example provider-specific browser SDK flows).

Non-goal at this stage:

- claiming permanent, universal compatibility from a single run.

## 7) Open Questions and Next Iteration Options

Open questions:

1. What minimum evidence bundle should define internal "certified for partner pilot"?
2. Which live checks should eventually become release-blocking in CI?
3. How far should smart-account native validation go in this harness versus separate tooling?

Practical next options:

1. Add policy presets per integration archetype (EOA, API-routed custody, smart account).
2. Harden live-run governance (stable env, artifact retention, clearer escalation rules).
3. Expand controlled write/read scenarios to reduce residual blind spots.

## 8) Conclusion

The Compatibility Harness is now a serious diagnostic product for guided partner validation.

It gives actionable and conservative answers to the real integration question: what is proven compatible today, what is blocked by infrastructure, and what remains unvalidated.

This makes it suitable for internal technical review and partner pilot workflows, while keeping scope and claims explicit.
