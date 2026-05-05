# ERC-1363 `transferAndCall` Shielding Pattern

**Issue:** [SDK-144](https://linear.app/zama/issue/SDK-144/adopt-transferandcall-erc-1363-shielding-pattern-alongside-approvewrap)
**Date:** 2026-05-05
**Status:** Draft

## Problem

`Token.shield()` currently uses a two-transaction `approve` + `wrap` pattern. The wrapper contract (`ERC7984ERC20WrapperUpgradeable`) already implements `IERC1363Receiver`, enabling a single-transaction `transferAndCall` path when the underlying ERC-20 supports ERC-1363. The SDK should prefer this path when available, falling back to the legacy two-tx path otherwise.

### Why this matters

- Single transaction instead of two — better UX, lower gas, no orphaned-allowance state
- Avoids the "infinite approval" anti-pattern
- Aligns with how the wrapper contracts are designed to be used

### Why it can't be a blanket switch

ERC-1363 is not part of any major stablecoin (USDC, USDT, DAI). The SDK must detect support at runtime and route accordingly.

## Design

### API surface

#### `ShieldOptions` extension

```ts
export interface ShieldOptions extends ShieldCallbacks {
  approvalStrategy?: "max" | "exact" | "skip";
  shieldingStrategy?: "auto" | "transferAndCall" | "approve";
  to?: Address;
}
```

- `"auto"` (default): probe ERC-1363 via ERC-165, use `transferAndCall` if supported, fall back to `approve` + `wrap`.
- `"transferAndCall"`: force single-tx path. Throws `ERC1363NotSupportedError` if the underlying token doesn't support it.
- `"approve"`: force legacy two-tx path, skip detection.

When the resolved path is `transferAndCall`, `approvalStrategy` is silently ignored (no approval is needed).

#### New contract builder

In `packages/sdk/src/contracts/erc20.ts`:

```ts
export function transferAndCallContract(
  tokenAddress: Address,
  to: Address,
  amount: bigint,
  data: Hex = "0x",
) {
  return {
    address: tokenAddress,
    abi: erc1363Abi,
    functionName: "transferAndCall",
    args: [to, amount, data],
  } as const;
}
```

#### New ERC-165 constant

In `packages/sdk/src/contracts/erc165.ts`:

```ts
export const ERC1363_INTERFACE_ID = "0xb0202a11";
```

#### New error type

`ERC1363NotSupportedError` — thrown only when the user explicitly forces `shieldingStrategy: "transferAndCall"` on a token that doesn't support it.

### Detection and caching

#### Core SDK layer — `Token` instance cache

```ts
// Private cached result — null means not yet probed
#erc1363Supported: boolean | null = null;

async #supportsTransferAndCall(): Promise<boolean> {
  if (this.#erc1363Supported !== null) return this.#erc1363Supported;

  const underlying = await this.#getUnderlying();
  try {
    const supported = await this.sdk.provider.readContract(
      supportsInterfaceContract(underlying, ERC1363_INTERFACE_ID),
    );
    this.#erc1363Supported = supported;
  } catch {
    // ERC-165 not implemented or call reverted — assume no support
    this.#erc1363Supported = false;
  }
  return this.#erc1363Supported;
}
```

A public `supportsTransferAndCall()` method delegates to the private one, allowing the query layer to use it.

#### Path resolution

```ts
async #resolveShieldingPath(
  strategy: ShieldOptions["shieldingStrategy"] = "auto",
): Promise<"transferAndCall" | "approve"> {
  if (strategy === "approve") return "approve";

  const supported = await this.#supportsTransferAndCall();

  if (strategy === "transferAndCall" && !supported) {
    throw new ERC1363NotSupportedError(await this.#getUnderlying());
  }

  return supported ? "transferAndCall" : "approve";
}
```

Detection failure (revert, missing ERC-165) silently falls back to `"approve"`.

#### Query layer — `supportsTransferAndCallQueryOptions`

New query factory in `packages/sdk/src/query/`:

```ts
export function supportsTransferAndCallQueryOptions(sdk: ZamaSDK, tokenAddress: Address) {
  return {
    queryKey: ["supportsTransferAndCall", tokenAddress],
    queryFn: async () => {
      const token = sdk.createToken(tokenAddress);
      return token.supportsTransferAndCall();
    },
    staleTime: Infinity,
  };
}
```

#### React layer — `useSupportsTransferAndCall` hook

```ts
export function useSupportsTransferAndCall(config: { tokenAddress: Address }) {
  const sdk = useZamaSDK();
  return useQuery(supportsTransferAndCallQueryOptions(sdk, config.tokenAddress));
}
```

React apps can use this to show UI hints (e.g. "1 transaction" vs "2 transactions") before the user clicks shield.

### `shield()` flow

Updated orchestration:

```
shield(amount, options?)
  -> requireSigner, requireChainAlignment
  -> #resolveShieldingPath(options.shieldingStrategy)
  -> if "transferAndCall":
      -> validate ERC-20 balance
      -> encode data: "0x" if shielding to self, abi.encode(to) if shielding to other
      -> signer.writeContract(transferAndCallContract(underlying, wrapper, amount, data))
      -> emit ShieldSubmitted, fire onShieldSubmitted
      -> waitForReceipt, return
  -> if "approve":
      -> existing flow unchanged (validate balance -> #ensureAllowance -> wrapContract)
```

Key points:

- `transferAndCall` is called on the **underlying ERC-20** (not the wrapper). The wrapper address is the `to` parameter.
- `data` encoding: empty bytes for self-shield, ABI-encoded recipient address for shield-to-other (the wrapper's `onTransferReceived` extracts the recipient from the first 20 bytes of `data`).
- `onApprovalSubmitted` callback is never fired on the `transferAndCall` path (no approval occurs).
- `onShieldSubmitted` fires on both paths. Same `TransactionResult` return type.

### Example app migration

`examples/example-hoodi/src/components/ShieldCard.tsx` currently does manual `approve` + `wrap` with custom USDT handling. Replace with:

```ts
const token = sdk.createToken(tokenAddress);
return token.shield(amount);
```

The manual allowance checking, USDT reset logic, and phase tracking all go away. Optionally use `useSupportsTransferAndCall` to show whether the user will get a one-tx or two-tx experience.

### Documentation and agent context

- Update `fhevm-developer` skill to recommend `token.shield(amount)` as the default, noting auto-detection
- Add a note in `docs/agents/conventions.md` that `transferAndCall` is the preferred shielding path when supported
- Add a section to the integration guide (SDK-123) explaining the pattern
- These are sub-tickets per SDK-144 and don't affect the core design

## Backward compatibility

- `Token.shield()` with no `shieldingStrategy` defaults to `"auto"`, which falls back to `approve` + `wrap` for non-ERC-1363 tokens. Existing code is unaffected.
- `approvalStrategy` continues to work on the `"approve"` path. Silently ignored on the `"transferAndCall"` path.
- No breaking changes to `ShieldOptions`, `TransactionResult`, or any public type.

## Out of scope

- Portfolio app changes (separate ownership)
- Super App changes (internal)
- Changes to the wrapper contract (already supports ERC-1363; tracked under PRO-413)
- Native ERC-7984 token issuance flows (no underlying ERC-20)
