# Remove unnecessary assertion in unprefixHex

## Summary
`unprefixHex` asserts `0x` prefix on viem's `Hex` type, which is already typed as `` `0x${string}` ``. The assertion can never fail for correctly-typed callers.

## Severity
Low (dead code)

## Files to change
- `packages/sdk/src/utils.ts` (lines 14-16)

## Change
Remove the `assertCondition` and simplify to just `return value.slice(2);`.

## Accept if
All callers pass typed `Hex` values (no `as Hex` casts on unvalidated strings upstream).

## Source
summary.md IMP-0029, summary-00.md IMP-0011
