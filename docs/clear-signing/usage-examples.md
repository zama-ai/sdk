# Clear Signing Usage Examples

The Clear Signing Intent Layer converts SDK context into a `ClearSigningIntent`
object that can be rendered, snapshotted, inspected, or later exported to a
descriptor format such as ERC-7730.

Pure builders remain wallet-agnostic: they do not perform network calls, do not
sign, and do not submit transactions. Runtime SDK methods and React hooks can
also generate intents from live SDK objects when an app wants the SDK to resolve
wallet, chain, token, wrapper, and routing context.

## Import

```ts
import {
  buildConfidentialTransferIntent,
  buildShieldViaWrapIntent,
  buildAllowIntentFromEIP712,
  renderClearSigningIntent,
  validateClearSigningIntent,
} from "@zama-fhe/sdk/clear-signing";
```

The same exports are also available from the main `@zama-fhe/sdk` entry point.

## Confidential Transfer

```ts
const intent = buildConfidentialTransferIntent({
  tokenAddress: "0x1111111111111111111111111111111111111111",
  senderAddress: "0x2222222222222222222222222222222222222222",
  recipientAddress: "0x3333333333333333333333333333333333333333",
  amount: 100n,
  encryptedAmount: {
    value: "0xabababababababababababababababababababababababababababababababab",
  },
  hasInputProof: true,
});
```

Important output properties:

| Field              | Visibility  | Reason                                                     |
| ------------------ | ----------- | ---------------------------------------------------------- |
| `Amount`           | `public`    | Plaintext SDK input before encryption.                     |
| `Encrypted amount` | `encrypted` | Opaque on-chain handle. Render as hidden encrypted amount. |
| `Input proof`      | `internal`  | Protocol proof. Do not show as primary user wording.       |

Runtime preview:

```ts
const token = sdk.createToken("0x1111111111111111111111111111111111111111");

const intent = await token.createConfidentialTransferClearSigningIntent(
  "0x3333333333333333333333333333333333333333",
  100n,
);
```

Runtime callback during the actual operation:

```ts
await token.confidentialTransfer("0x3333333333333333333333333333333333333333", 100n, {
  onClearSigningIntent: (intent) => {
    const rendered = renderClearSigningIntent(intent);
    console.log(rendered.title);
  },
});
```

## Shield Via Approve And Wrap

```ts
const intent = buildShieldViaWrapIntent({
  underlyingTokenAddress: "0x1111111111111111111111111111111111111111",
  wrapperAddress: "0x2222222222222222222222222222222222222222",
  senderAddress: "0x3333333333333333333333333333333333333333",
  recipientAddress: "0x3333333333333333333333333333333333333333",
  amount: 100n,
  approvalAmount: 2n ** 256n - 1n,
  maxApproval: true,
});
```

This intent includes:

1. A high-level shield summary.
2. The public amount and recipient.
3. A warning that the wrapper may first be approved to spend public ERC-20 tokens.
4. A max approval warning when `maxApproval` is true.

## Direct Decrypt Authorization From EIP-712

```ts
const intent = buildAllowIntentFromEIP712(typedData);
```

This maps `UserDecryptRequestVerification` into an `allow` intent:

| EIP-712 field       | Visibility |
| ------------------- | ---------- |
| `contractAddresses` | `public`   |
| `startTimestamp`    | `public`   |
| `durationDays`      | `public`   |
| `publicKey`         | `internal` |
| `extraData`         | `internal` |

The generated warning clarifies that this is a decryption authorization, not a
token transfer or spending approval.

## React Runtime Preview

```tsx
import { useConfidentialTransferClearSigningIntent } from "@zama-fhe/react-sdk";

function PreviewButton() {
  const preview = useConfidentialTransferClearSigningIntent({
    address: "0x1111111111111111111111111111111111111111",
  });

  return (
    <button
      onClick={() =>
        preview.mutate({
          to: "0x3333333333333333333333333333333333333333",
          amount: 100n,
        })
      }
    >
      Preview transfer
    </button>
  );
}
```

Available React intent hooks include:

1. `useAllowClearSigningIntent`
2. `useAllowAsClearSigningIntent`
3. `useDelegateDecryptionClearSigningIntent`
4. `useConfidentialTransferClearSigningIntent`
5. `useShieldClearSigningIntent`
6. `useUnwrapClearSigningIntent`
7. `useUnwrapAllClearSigningIntent`
8. `useFinalizeUnwrapClearSigningIntent`

## Rendering Guidance

Renderers should:

1. Show `title`, `summary`, and `warnings` prominently.
2. Show `public` and safe `derived` fields in the primary display.
3. Show `encrypted` fields only with their conservative `displayValue`.
4. Hide `internal` fields by default.
5. Keep `rawContext` available for advanced inspection or descriptor export.

The SDK also provides a conservative helper:

```ts
const rendered = renderClearSigningIntent(intent);
```

By default, `renderClearSigningIntent` hides `internal` fields and renders
`encrypted` fields through their safe `displayValue`.

Before rendering or exporting, callers can validate the intent:

```ts
const validation = validateClearSigningIntent(intent);
if (!validation.valid) {
  // Treat validation issues as security-sensitive integration failures.
}
```

Renderers must not:

1. Display encrypted handles as plaintext amounts.
2. Interpolate encrypted values into natural-language summaries unless a safe
   fallback is used.
3. Treat `delegateDecryption` as token spending or operator access.
4. Treat `unwrap` as completed public withdrawal.
