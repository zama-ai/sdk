import { parseUnits } from "ethers";

/**
 * Parse a human-readable amount string into a raw BigInt, using the token's
 * decimal precision. Returns BigInt(0) on empty input or invalid values (e.g. too
 * many decimal places for the given precision).
 */
export function parseAmount(value: string, decimals: number): bigint {
  try {
    return value ? parseUnits(value, decimals) : 0n;
  } catch {
    return 0n;
  }
}

/**
 * The smallest positive amount the token can represent (10^-decimals), as a
 * decimal string. Used as the `min` for amount inputs so native form validation
 * rejects zero and sub-precision values without a manual check.
 *
 * `decimals` is coerced with `Number()` because ethers decodes the on-chain
 * `decimals()` return (a `uint8`) as a `bigint` at runtime — even though the SDK
 * types it as `number` — and mixing that bigint into the arithmetic below would
 * throw "Cannot mix BigInt and other types".
 */
export function minAmount(decimals: number): string {
  const d = Number(decimals);
  return d > 0 ? `0.${"0".repeat(d - 1)}1` : "1";
}
