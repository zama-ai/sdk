# Example Upgrade Manual Checklist

Use this checklist after deterministic checks pass. Keep the list practical and update it when manual review catches a gap that automation missed.

## Common UI Checks

- App starts from a clean install using the documented commands.
- Wallet connection flow works from a fresh browser profile.
- Wrong-network or unsupported-network state is visible and recoverable.
- First decrypt requires an explicit user action and does not prompt before that action.
- Subsequent decrypts reuse the cached session without repeated signatures.
- Token list or configured token metadata is displayed correctly.
- Shield flow works or fails with a clear actionable error.
- Confidential transfer flow works or fails with a clear actionable error.
- Unshield flow handles both request and finalize phases.
- Pending unshield state survives a page reload when the app supports it.
- Delegation grant, revoke, and decrypt-as flows work when present.
- Wallet/account switch does not leak stale balances, sessions, or selected-token state.
- Basic responsive layout remains usable on desktop and mobile widths.

## Node Example Checks

- `.env.example` still documents every required variable.
- `npm start` completes the expected lifecycle against the configured network.
- Logs identify each lifecycle phase clearly enough for a developer to debug failures.
- Secrets are never printed.

## Human Review Checks

- README and WALKTHROUGH match the upgraded code.
- The example still teaches the intended stack, not just a mechanically compiling integration.
- The implementation follows "clear-text in, clear-text out"; FHE details stay inside SDK calls.
- No changes were made outside the intended example directory unless explicitly planned.
