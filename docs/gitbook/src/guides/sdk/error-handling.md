# Error Handling

All SDK errors extend `ZamaError` and carry a `.code` string. You can catch them with `instanceof` or use the `matchZamaError` helper for cleaner code.

## Catching errors

```ts
import { ZamaError, SigningRejectedError, EncryptionFailedError } from "@zama-fhe/sdk";

try {
  await token.confidentialTransfer(to, amount);
} catch (error) {
  if (error instanceof SigningRejectedError) {
    // User clicked "Reject" in their wallet
  } else if (error instanceof EncryptionFailedError) {
    // FHE encryption failed (usually a WASM/worker issue)
  } else if (error instanceof ZamaError) {
    // Some other SDK error — check error.code
  } else {
    // Not an SDK error
  }
}
```

## `matchZamaError` — cleaner alternative

Instead of `instanceof` chains, match on error codes:

```ts
import { matchZamaError } from "@zama-fhe/sdk";

matchZamaError(error, {
  SIGNING_REJECTED: () => toast("Please approve the transaction in your wallet"),
  ENCRYPTION_FAILED: () => toast("Encryption failed — please try again"),
  TRANSACTION_REVERTED: (e) => toast(`Transaction failed: ${e.message}`),
  _: () => toast("Something went wrong"),
});
```

The `_` wildcard catches any `ZamaError` not explicitly handled. If the error isn't a `ZamaError` at all (and no `_` is provided), `matchZamaError` returns `undefined`.

## Error types

| Error                       | Code                     | What happened                                                                         |
| --------------------------- | ------------------------ | ------------------------------------------------------------------------------------- |
| `SigningRejectedError`      | `SIGNING_REJECTED`       | User rejected the wallet signature                                                    |
| `SigningFailedError`        | `SIGNING_FAILED`         | Wallet signature failed (not a rejection — might be a connectivity or firmware issue) |
| `EncryptionFailedError`     | `ENCRYPTION_FAILED`      | FHE encryption failed in the Web Worker                                               |
| `DecryptionFailedError`     | `DECRYPTION_FAILED`      | FHE decryption failed                                                                 |
| `ApprovalFailedError`       | `APPROVAL_FAILED`        | ERC-20 approval transaction failed                                                    |
| `TransactionRevertedError`  | `TRANSACTION_REVERTED`   | On-chain transaction reverted                                                         |
| `InvalidCredentialsError`   | `INVALID_CREDENTIALS`    | Relayer rejected FHE keypair (stale or malformed)                                     |
| `CredentialExpiredError`    | `CREDENTIAL_EXPIRED`     | FHE keypair expired — user needs to re-sign                                           |
| `NoCiphertextError`         | `NO_CIPHERTEXT`          | No encrypted balance exists for this account (never shielded)                         |
| `RelayerRequestFailedError` | `RELAYER_REQUEST_FAILED` | Relayer HTTP request failed (check `.statusCode`)                                     |

## "No balance" vs "zero balance"

These are different situations:

- **`NoCiphertextError`** — the account has never shielded tokens. There's no encrypted balance to decrypt. Show something like "No confidential balance" in your UI.
- **Balance of `0n`** — the account has shielded before but currently holds zero. Show "Balance: 0".

```ts
import { NoCiphertextError } from "@zama-fhe/sdk";

try {
  const balance = await token.balanceOf();
  showBalance(balance); // could be 0n
} catch (error) {
  if (error instanceof NoCiphertextError) {
    showEmptyState("Shield tokens to get started");
  }
}
```

## Common problems

| What you see                              | Why                                         | Fix                                                                                                 |
| ----------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `SigningRejectedError` on every decrypt   | Wallet rejected the EIP-712 signature       | Make sure the wallet supports `eth_signTypedData_v4`. Some hardware wallets need a firmware update. |
| Balance always `undefined`                | Encrypted handle is zero (never shielded)   | Check if the user has shielded tokens first. Catch `NoCiphertextError`.                             |
| `EncryptionFailedError`                   | Web Worker can't load WASM                  | Check your CSP headers — the worker needs `wasm-unsafe-eval`.                                       |
| `DecryptionFailedError` after page reload | Unshield was interrupted                    | Use `loadPendingUnshield()` on mount to detect and `resumeUnshield()` to complete it.               |
| `TransactionRevertedError` on finalize    | Unwrap already finalized or tx hash invalid | Check the unwrap tx — if already finalized, clear the pending state with `clearPendingUnshield()`.  |
| `RelayerRequestFailedError`               | Relayer URL wrong or auth missing           | Verify `relayerUrl` in your transport config. If using API key auth, check the `auth` option.       |
