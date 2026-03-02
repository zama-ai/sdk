# Troubleshooting

## Common problems

| What you see                                              | Why                                         | Fix                                                                                                 |
| --------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `SigningRejectedError` on every decrypt                   | Wallet rejected the EIP-712 signature       | Make sure the wallet supports `eth_signTypedData_v4`. Some hardware wallets need a firmware update. |
| Balance always `undefined`                                | Encrypted handle is zero (never shielded)   | Check if the user has shielded tokens first. Catch `NoCiphertextError`.                             |
| `EncryptionFailedError`                                   | Web Worker can't load WASM                  | Check your CSP headers — the worker needs `wasm-unsafe-eval`.                                       |
| `DecryptionFailedError` after page reload                 | Unshield was interrupted                    | Use `loadPendingUnshield()` on mount to detect and `resumeUnshield()` to complete it.               |
| `TransactionRevertedError` on finalize                    | Unwrap already finalized or tx hash invalid | Check the unwrap tx — if already finalized, clear the pending state with `clearPendingUnshield()`.  |
| `RelayerRequestFailedError`                               | Relayer URL wrong or auth missing           | Verify `relayerUrl` in your transport config. If using API key auth, check the `auth` option.       |
| `DecryptionFailedError`: "not authorized to user decrypt" | User has no ACL permission on this handle   | See [below](#decryptionfailederror-not-authorized-to-user-decrypt).                                 |

## `DecryptionFailedError`: "not authorized to user decrypt"

The relayer enforces an on-chain Access Control List (ACL). Every encrypted handle has a set of addresses that may decrypt it. If the user's address isn't in that list, the relayer rejects the request with this message.

ACL permissions are granted automatically by the token contract as a side effect of transfers, mints, and burns — **there is nothing to call in the SDK to fix this**. The root cause is always one of the following.

### Account has never had a balance

The most frequent cause. If an account has never shielded tokens or received a transfer, the contract has never recorded an ACL entry for it, and its balance handle cannot be decrypted.

**Fix:** catch `NoCiphertextError` before attempting decryption and show an appropriate empty state. The SDK raises this for zero/uninitialized handles before even reaching the relayer.

```ts
import { NoCiphertextError } from "@zama-fhe/sdk";

try {
  const balance = await token.balanceOf();
  showBalance(balance);
} catch (error) {
  if (error instanceof NoCiphertextError) {
    showEmptyState("Shield tokens to get started");
  }
}
```

If you're using a custom token contract and seeing this error even for accounts that do have a balance, the contract is missing the ACL grant on its mint or transfer path. That's a contract bug, not an SDK issue.

### Wrong address

The user is trying to decrypt a handle that belongs to a different address — for example, fetching the balance of `someOtherAddress` and then decrypting the result as the connected user.

**Fix:** only call `token.balanceOf()` without arguments. It internally uses `signer.getAddress()` to read and decrypt the connected wallet's own balance. Never attempt to decrypt a balance fetched for a different address.

### Coprocessor lag (local Hardhat only)

On Hardhat, the mock coprocessor indexes ACL events asynchronously. Immediately after a transaction that updates a balance, it may not have processed the new ACL entry yet, causing a false authorization failure.

**Fix:** mine a few extra blocks before retrying the decrypt. In tests, this is typically done by calling `evm_mine` a couple of times.

```ts
// In a Hardhat test, after a transfer:
await network.provider.send("evm_mine");
await network.provider.send("evm_mine");
const balance = await token.balanceOf();
```

### Operator/delegate cannot decrypt

`setOperator` grants a delegate the right to submit transactions on behalf of a user, but it does **not** grant them the right to decrypt that user's encrypted values. The relayer will reject a decrypt attempt from an operator address.

**Fix:** decryption must be performed by the address that owns the balance. If your flow requires an operator to read a user's balance, that is a contract-level concern — the token contract would need to be designed to grant the operator explicit ACL access.
