# Remove dead `=== undefined` branches in ZamaSDK

## Summary
`zama-sdk.ts` checks `this.#lastAddress === undefined` and `this.#lastChainId === undefined`, but both fields are typed `T | null` (never `undefined`) and initialized to `null`.

## Severity
Low (dead code)

## Files to change
- `packages/sdk/src/token/zama-sdk.ts` (lines 155-162)

## Change
Replace:
```ts
if (this.#lastAddress === null || this.#lastAddress === undefined || this.#lastChainId === null || this.#lastChainId === undefined)
```
With:
```ts
if (this.#lastAddress === null || this.#lastChainId === null)
```

## Source
summary.md IMP-0028
