/**
 * Freeze `value` and every object reachable from it. Used for the ABI tables:
 * they decide which function selector each call encodes, so a dependency must
 * not be able to edit an entry at runtime.
 */
export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const entry of Object.values(value)) {
      deepFreeze(entry);
    }
  }
  return value;
}
