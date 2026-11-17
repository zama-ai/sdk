# Permits

A decryption permit lets the connected wallet decrypt its confidential balances without a new signature each time. The permits page shows whether the wallet holds a permit for a set of tokens and lets the user grant one, revoke it, revoke every permit, or clear the stored credentials.

## Sub-features

- `permits-status` shows `Allowed: false` before any grant.
- `permits-allow` grants a permit; the status becomes `Allowed: true`.
- `permits-revoke` revokes the permit for the listed tokens; `Revoked successfully`, then `Allowed: false` after a reload.
- `permits-revoke-all` revokes every permit; `All permits revoked successfully`, then `Allowed: false` after a reload.
- `permits-clear` clears the stored keypair and permits; `Credentials cleared successfully`, then `Allowed: false` after a reload.

## How to get to it (user POV)

- The sidebar has no link to this page. Open `/permits` (both confidential tokens) or `/permits?tokens=<token>,<token>`.
- `Reveal Balances` on `/wallet` also grants a permit for both confidential tokens before it decrypts.

## Driving it with verify.sh

Preconditions:

- Baseline preconditions from the README. No journey ships for this feature yet.
- Fresh browser storage. Each Playwright test gets a new browser context, so no permit is stored at the start.

- **Repo spec.** Run `$S run --project=repo tests/permits.spec.ts`. Four tests pass.
- **Status.** Open `/permits`. `permits-status` reads `Allowed: false`.
- **Allow.** Click `permits-allow-button` (label `Allow`). `permits-status` reads `Allowed: true`.
- **Revoke.** Click `permits-revoke-button`. `revoke-success` reads `Revoked successfully`. Reload; `permits-status` reads `Allowed: false`.
- **Revoke all.** Allow again, then click `permits-revoke-all-button`. `revoke-all-success` reads `All permits revoked successfully`. Reload; `Allowed: false`.
- **Clear credentials.** Allow again, then click `permits-clear-credentials-button`. `clear-credentials-success` reads `Credentials cleared successfully`. Reload; `Allowed: false`.

## Gotchas

- The status can read `Loading...` first. Wait for `Allowed:`.
- Assert the status after a revoke or clear on a reloaded page, as the repo spec does. The success line only proves the mutation returned.
- `Allow All` in the sidebar is a different page (`allow-all-button`, `Allowed successfully`). It is not this panel.
