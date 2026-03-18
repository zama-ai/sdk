import { parseUnits } from "ethers";

/**
 * Parse a human-readable amount string into a raw BigInt, using the token's
 * decimal precision. Returns BigInt(0) on empty input or invalid values (e.g. too
 * many decimal places for the given precision).
 */
export function parseAmount(value: string, decimals: number): bigint {
  try {
    return value ? parseUnits(value, decimals) : BigInt(0);
  } catch {
    return BigInt(0);
  }
}
