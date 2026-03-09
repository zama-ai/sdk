---
title: useGenerateKeypair
description: Low-level mutation hook that generates a fresh FHE keypair via the relayer.
---

# useGenerateKeypair

Low-level mutation hook that generates a fresh FHE keypair via the relayer. Returns a public/private key pair for use in decrypt authorization.

::: warning You probably don't need this
[`useAllow`](/reference/react/useAllow) and [`useConfidentialBalance`](/reference/react/useConfidentialBalance) handle keypair generation automatically. Call `useGenerateKeypair` only when managing FHE credentials manually.
:::

## Import

```ts
import { useGenerateKeypair } from "@zama-fhe/react-sdk";
```

## Usage

::: code-group

```tsx [component.tsx]
import { useGenerateKeypair } from "@zama-fhe/react-sdk";

function GenerateButton() {
  const { mutateAsync: generateKeypair, isPending, data: keypair } = useGenerateKeypair(); // [!code focus]

  async function handleGenerate() {
    const kp = await generateKeypair(); // [!code focus]
    console.log("Public key:", kp.publicKey);
    console.log("Private key:", kp.privateKey);
  }

  return (
    <button onClick={handleGenerate} disabled={isPending}>
      {isPending ? "Generating..." : "Generate Keypair"}
    </button>
  );
}
```

:::

## Parameters

`useGenerateKeypair` takes no constructor parameters.

## Mutation Variables

`mutate` / `mutateAsync` take no arguments.

## Return Type

```ts
import { type KeypairType } from "@zama-fhe/sdk";
```

`data` resolves to `KeypairType<string>` with two fields:

- **`publicKey`** — the FHE public key (string-encoded).
- **`privateKey`** — the FHE private key (string-encoded).

Pass these to [`useUserDecrypt`](/reference/react/useUserDecrypt) when decrypting handles manually.

<!--@include: @/shared/mutation-result.md-->

## Related

- [`useAllow`](/reference/react/useAllow) — high-level hook that generates a keypair and caches the session signature
- [`useUserDecrypt`](/reference/react/useUserDecrypt) — uses the generated keypair to decrypt handles
- [`useEncrypt`](/reference/react/useEncrypt) — encrypt values (does not require a keypair)
