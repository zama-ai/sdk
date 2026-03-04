/**
 * Convert SDK result values to bigint record.
 * Handles bigint, boolean, string, and number values.
 */
export function convertToBigIntRecord(result: Record<string, unknown>): Record<string, bigint> {
  const clearValues: Record<string, bigint> = {};
  for (const [handle, value] of Object.entries(result)) {
    if (typeof value === "bigint") {
      clearValues[handle] = value;
    } else if (typeof value === "boolean") {
      clearValues[handle] = value ? BigInt(1) : BigInt(0);
    } else if (typeof value === "string" || typeof value === "number") {
      clearValues[handle] = BigInt(value);
    } else {
      throw new TypeError(`Unexpected decrypted value type for handle ${handle}: ${typeof value}`);
    }
  }
  return clearValues;
}
