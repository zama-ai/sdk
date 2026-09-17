import type { EncryptInput } from "@zama-fhe/sdk";
import type {
  EncryptRequest,
  EncryptResponse,
  EncryptInput as WireInput,
} from "./generated/zama/sdk/v1alpha1/sidecar.js";
import type { ContextSdk } from "./runtime.js";
import { address, bytes, integer, unsignedInteger } from "./encoding.js";
import { invalidArgument } from "./errors.js";

export function encryptInput(input: WireInput): EncryptInput {
  const value = input.value;
  switch (value?.$case) {
    case "ebool":
      return { type: "ebool", value: value.ebool };
    case "eboolBigint":
      // The SDK, not the sidecar, rejects bigints outside 0n and 1n.
      return { type: "ebool", value: integer(value.eboolBigint, "Encryption integer") as 0n | 1n };
    case "euint8":
      return { type: "euint8", value: integer(value.euint8, "Encryption integer") };
    case "euint16":
      return { type: "euint16", value: integer(value.euint16, "Encryption integer") };
    case "euint32":
      return { type: "euint32", value: integer(value.euint32, "Encryption integer") };
    case "euint64":
      return { type: "euint64", value: integer(value.euint64, "Encryption integer") };
    case "euint128":
      return { type: "euint128", value: integer(value.euint128, "Encryption integer") };
    case "euint256":
      return { type: "euint256", value: integer(value.euint256, "Encryption integer") };
    case "eaddress":
      return { type: "eaddress", value: address(value.eaddress) };
    default:
      throw invalidArgument("Encryption input requires a typed value.");
  }
}

export async function encrypt(
  sdk: ContextSdk,
  request: EncryptRequest,
  signal: AbortSignal,
): Promise<EncryptResponse> {
  const result = await sdk.encrypt(
    {
      values: request.values.map(encryptInput),
      contractAddress: address(request.contractAddress),
      userAddress: address(request.userAddress),
    },
    {
      signal,
      ...(request.timeoutMs === undefined
        ? {}
        : { timeout: unsignedInteger(request.timeoutMs, "Timeout") }),
    },
  );
  return {
    encryptedValues: result.encryptedValues.map(bytes),
    inputProof: bytes(result.inputProof),
  };
}
