import type { EncryptInput } from "@zama-fhe/sdk";
import type {
  EncryptRequest,
  EncryptResponse,
  EncryptInput as WireInput,
} from "./generated/zama/sdk/v1alpha1/sidecar.js";
import type { ContextSdk } from "./runtime.js";
import { address, bytes, unsignedInteger } from "./encoding.js";
import { invalidArgument } from "./errors.js";

function integer(value: string): bigint {
  if (!/^(0|-[1-9][0-9]*|[1-9][0-9]*)$/.test(value)) {
    throw invalidArgument("Encryption integers must use canonical decimal encoding.");
  }
  return BigInt(value);
}

export function encryptInput(input: WireInput): EncryptInput {
  const { type, value } = input;
  switch (type) {
    case "euint8":
    case "euint16":
    case "euint32":
    case "euint64":
    case "euint128":
    case "euint256":
      if (value?.$case === "bigintValue") {
        return { type, value: integer(value.bigintValue) };
      }
      break;
    case "ebool":
      if (value?.$case === "boolValue") {
        return { type, value: value.boolValue };
      }
      if (value?.$case === "bigintValue") {
        // The SDK owns value-range validation, including bigint boolean inputs.
        return { type, value: integer(value.bigintValue) as 0n | 1n };
      }
      break;
    case "eaddress":
      if (value?.$case === "addressValue") {
        return { type, value: address(value.addressValue) };
      }
      break;
  }
  throw invalidArgument("Encryption input type and value encoding do not match.");
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
