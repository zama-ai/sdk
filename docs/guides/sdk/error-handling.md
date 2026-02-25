# Error Handling

All SDK errors extend `ZamaError`. Use `instanceof` to catch specific error types:

```ts
import {
  ZamaError,
  SigningRejectedError,
  EncryptionFailedError,
  TransactionRevertedError,
} from "@zama-fhe/sdk";

try {
  await token.confidentialTransfer(to, amount);
} catch (error) {
  if (error instanceof SigningRejectedError) {
    // User rejected wallet signature
  }
  if (error instanceof EncryptionFailedError) {
    // FHE encryption failed
  }
  if (error instanceof TransactionRevertedError) {
    // On-chain transaction reverted
  }
  if (error instanceof ZamaError) {
    // Any other SDK error — check error.code for details
  }
}
```

## Error Classes

| Error Class                 | Code                     | Description                                                               |
| --------------------------- | ------------------------ | ------------------------------------------------------------------------- |
| `SigningRejectedError`      | `SIGNING_REJECTED`       | User rejected the wallet signature request.                               |
| `SigningFailedError`        | `SIGNING_FAILED`         | Wallet signature failed for a non-rejection reason.                       |
| `EncryptionFailedError`     | `ENCRYPTION_FAILED`      | FHE encryption operation failed.                                          |
| `DecryptionFailedError`     | `DECRYPTION_FAILED`      | FHE decryption operation failed.                                          |
| `ApprovalFailedError`       | `APPROVAL_FAILED`        | ERC-20 approval transaction failed.                                       |
| `TransactionRevertedError`  | `TRANSACTION_REVERTED`   | On-chain transaction reverted.                                            |
| `InvalidCredentialsError`   | `INVALID_CREDENTIALS`    | Relayer rejected credentials (stale or expired).                          |
| `NoCiphertextError`         | `NO_CIPHERTEXT`          | No FHE ciphertext exists for this account (e.g. never shielded).          |
| `RelayerRequestFailedError` | `RELAYER_REQUEST_FAILED` | Relayer HTTP error. Carries a `statusCode` property with the HTTP status. |

## `matchZamaError`

For cleaner error handling without `instanceof` chains, use `matchZamaError`. Falls through to the `_` wildcard if no handler matches. Returns `undefined` for non-SDK errors when no `_` handler is provided.

```ts
import { matchZamaError } from "@zama-fhe/sdk";

matchZamaError(error, {
  SIGNING_REJECTED: () => toast("Please approve in wallet"),
  ENCRYPTION_FAILED: () => toast("Encryption failed — try again"),
  TRANSACTION_REVERTED: (e) => toast(`Tx failed: ${e.message}`),
  _: () => toast("Something went wrong"),
});
```

## Distinguishing "No Ciphertext" from "Zero Balance"

```ts
import { NoCiphertextError, RelayerRequestFailedError } from "@zama-fhe/sdk";

try {
  const balance = await token.balanceOf();
} catch (error) {
  if (error instanceof NoCiphertextError) {
    // Account has never shielded — show "no confidential balance" in UI
  }
  if (error instanceof RelayerRequestFailedError) {
    console.error(`Relayer returned HTTP ${error.statusCode}`);
  }
}
```

A zero encrypted balance handle (`ZERO_HANDLE`) means the account has never shielded tokens. The SDK throws `NoCiphertextError` in this case, which is distinct from a successfully decrypted balance of `0n`. Use this to show appropriate UI states like "No confidential balance" vs "Balance: 0".

## Troubleshooting

| Symptom                                         | Root Cause                                  | Fix                                                                                                                |
| ----------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `SigningRejectedError` on every decrypt         | Wallet rejected the EIP-712 signature       | Ensure the wallet supports `eth_signTypedData_v4`. Some hardware wallets require a firmware update.                |
| Balance stuck at `undefined`                    | Encrypted handle is `0x000...` (no balance) | Check that the user has shielded tokens first. A zero handle means nothing to decrypt.                             |
| `EncryptionFailedError`                         | Web Worker failed to load WASM bundle       | Check CSP headers — the worker loads WASM from a CDN. Ensure `wasm-unsafe-eval` is allowed.                        |
| `DecryptionFailedError` after page reload       | Unshield interrupted mid-flow               | Use `loadPendingUnshield()` on mount to detect and `resumeUnshield()` to complete the finalize step.               |
| `TransactionRevertedError` on unshield finalize | Unwrap event not found or already finalized | Check the unwrap tx hash — if the tx was already finalized, clear the pending state with `clearPendingUnshield()`. |
| `RelayerRequestFailedError`                     | Relayer URL unreachable or auth missing     | Verify `relayerUrl` in transport config. If using API key auth, check the `auth` option is set correctly.          |
