import type { TypedDataDefinition } from "viem";
import type { EIP712TypedData } from "../relayer/types";

// Uints stay decimal strings although viem's types ask for bigint: a browser extension
// that patches bigint JSON serialization turns `1n` into `"1n"` and the wallet rejects it.
function withoutBigInts(value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map(withoutBigInts);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, withoutBigInts(entry)]),
    );
  }
  return value;
}

/**
 * Convert a decryption-permit {@link EIP712TypedData} into what viem's `signTypedData`
 * takes: `EIP712Domain` removed, `chainId` a number, no `bigint` left in the payload.
 */
export function toViemTypedData(typedData: EIP712TypedData): TypedDataDefinition {
  const { EIP712Domain: _, ...types } = typedData.types;
  // `chainId` must stay a number, not a string: viem infers the `EIP712Domain` type
  // from runtime value types and drops a string `chainId` from the signed domain.
  const { chainId, ...domain } = typedData.domain;
  return {
    primaryType: typedData.primaryType,
    types,
    domain: chainId === undefined ? domain : { ...domain, chainId: Number(chainId) },
    message: withoutBigInts(typedData.message),
    // Cast: `Eip712Like` is structural, so viem's generics cannot correlate `primaryType`, `types` and `message`.
  } as TypedDataDefinition;
}
