import { decodeFunctionData, encodeFunctionData, type Address, type Hex } from "viem";
import type { EncryptInput, ZamaSDK } from "@zama-fhe/sdk";
import type { ConfidentialOperationRegistry } from "../registry/index.js";
import type { TokenValidityCache } from "../registry/token-validity-cache.js";
import type { Logger } from "../logging/logger.js";
import { redactPublicArgs } from "../logging/redact.js";
import type { EthTransactionParams } from "./eth-transaction.js";
import { InvalidRewriteRequestError } from "./errors.js";

export interface RewriteResult {
  rewritten: boolean;
  data: Hex;
}

interface RealCall {
  abi: Parameters<typeof encodeFunctionData>[0]["abi"];
  functionName: string;
  args: readonly unknown[];
}

/** Bit width per unsigned FHE integer type — used only to bounds-check plaintext values before encrypting. */
const EUINT_BIT_WIDTHS: Partial<Record<string, number>> = {
  euint8: 8,
  euint16: 16,
  euint32: 32,
  euint64: 64,
  euint128: 128,
  euint256: 256,
};

/**
 * Checks whether a value fits its declared FHE type, rather than letting it
 * through to `sdk.encrypt()` unchecked. Defense in depth: this session did
 * not find an explicit bounds check in the SDK's own encrypt path, but
 * didn't exhaustively verify one doesn't exist deeper in the relayer/WASM
 * layer either — cheap to add regardless, and it turns a possible silent
 * wraparound (e.g. a `uint256` amount above `2^64-1` silently truncating to
 * a small `euint64`) into a clear rejection.
 *
 * Returns an error message if the value doesn't fit, `undefined` otherwise
 * — a return value rather than a thrown error so callers can audit-log the
 * rejection first, same as every other rejection path in this function.
 */
function checkValueFitsDeclaredType(input: EncryptInput): string | undefined {
  if (typeof input.value !== "bigint") return undefined;
  const bits = EUINT_BIT_WIDTHS[input.type];
  if (bits === undefined) return undefined;
  const max = (1n << BigInt(bits)) - 1n;
  if (input.value < 0n || input.value > max) {
    return (
      `Value ${input.value} does not fit in ${input.type} (max ${max}) — refusing to encrypt ` +
      "rather than risk silent truncation/wraparound."
    );
  }
  return undefined;
}

/**
 * The core auto-magic: if `tx` matches a known confidential *operation*
 * shape (by selector) AND `tx.to` is a genuine, on-chain-registered
 * confidential token (`sdk.registry.isConfidentialTokenValid`, cached
 * locally — see `TokenValidityCache` — not a locally configured address
 * list), decode the plaintext args and either encrypt an argument
 * (`"encrypt"` operations) or publicly decrypt a handle (`"decrypt"`
 * operations — see `src/registry/types.ts`), then re-encode the real
 * on-chain calldata. Otherwise, pass the calldata through unchanged.
 *
 * Every request that reaches here hits exactly one `logger.audit(...)`
 * call, so operators can verify the rewrite never applies outside a
 * confirmed confidential token.
 */
export async function maybeRewriteTransaction(params: {
  sdk: ZamaSDK;
  registry: ConfidentialOperationRegistry;
  tokenValidityCache: TokenValidityCache;
  chainId: number;
  tx: EthTransactionParams;
  logger: Logger;
  /** The actual JSON-RPC method being handled — `eth_sendTransaction`, `eth_call`, or `eth_estimateGas` — used only for audit logging. */
  method: string;
}): Promise<RewriteResult> {
  const { sdk, registry, tokenValidityCache, chainId, tx, logger, method } = params;

  if (!tx.to || !tx.data || tx.data === "0x") {
    logger.audit({ decision: "passthrough", method });
    return { rewritten: false, data: tx.data ?? "0x" };
  }
  const to: Address = tx.to;
  const data: Hex = tx.data;

  const operation = registry.find(chainId, data);
  if (!operation) {
    logger.audit({ decision: "passthrough", method });
    return { rewritten: false, data };
  }

  let isValidConfidentialToken: boolean;
  try {
    isValidConfidentialToken = await tokenValidityCache.resolve(sdk, to);
  } catch (error) {
    logger.audit({ decision: "rejected", method, reason: "registry lookup failed" });
    // Fail closed: never guess. A lookup failure must not silently fall
    // through as either a rewrite or a pass-through.
    throw new InvalidRewriteRequestError(
      `Could not verify whether ${to} is a registered confidential token — registry lookup ` +
        `failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!isValidConfidentialToken) {
    logger.audit({ decision: "passthrough", method });
    return { rewritten: false, data };
  }

  // Only "encrypt" operations bind the FHE input proof to a sender — public
  // decryption ("decrypt" operations) needs no signer and no "from" at all.
  if (operation.kind === "encrypt" && !tx.from) {
    logger.audit({ decision: "rejected", method, reason: "missing 'from' address" });
    throw new InvalidRewriteRequestError(
      `Cannot auto-encrypt for "${operation.name}" on ${to}: the request has no "from" address. ` +
        'Encrypted inputs are bound to the sender for the FHE input proof — see WALKTHROUGH.md ("known limitations").',
    );
  }

  let publicArgs: readonly unknown[];
  try {
    publicArgs = decodeFunctionData({ abi: operation.publicAbi, data }).args ?? [];
  } catch (error) {
    logger.audit({
      decision: "rejected",
      method,
      reason: "calldata does not match operation shape",
    });
    throw new InvalidRewriteRequestError(
      `Calldata for ${to} matched "${operation.name}"'s selector but failed to decode against its ` +
        `expected shape: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  logger.debug(
    `Matched "${operation.name}" for ${to} — decoded public args: ${JSON.stringify(
      redactPublicArgs(publicArgs),
    )}`,
  );

  let realCall: RealCall;
  if (operation.kind === "encrypt") {
    const encryptedInput = operation.extractEncryptedInput(publicArgs);
    const boundsError = checkValueFitsDeclaredType(encryptedInput);
    if (boundsError) {
      logger.audit({ decision: "rejected", method, reason: "value out of range for FHE type" });
      throw new InvalidRewriteRequestError(boundsError);
    }
    let encryptResult: Awaited<ReturnType<ZamaSDK["encrypt"]>>;
    try {
      encryptResult = await sdk.encrypt({
        values: [encryptedInput],
        contractAddress: to,
        userAddress: tx.from!, // guarded above
      });
    } catch (error) {
      logger.audit({ decision: "rejected", method, reason: "encrypt failed" });
      throw error;
    }
    const { encryptedValues, inputProof } = encryptResult;
    const encryptedValue = encryptedValues[0];
    if (!encryptedValue) {
      logger.audit({ decision: "rejected", method, reason: "encrypt returned no value" });
      throw new Error(`sdk.encrypt() returned no encrypted value for "${operation.name}"`);
    }
    realCall = operation.buildRealCall({
      contractAddress: to,
      publicArgs,
      encryptedValue,
      inputProof,
    });
  } else {
    const handles = operation.extractHandlesToDecrypt(publicArgs);
    let decryptResult: Awaited<ReturnType<ZamaSDK["decryption"]["decryptPublicValues"]>>;
    try {
      decryptResult = await sdk.decryption.decryptPublicValues(handles);
    } catch (error) {
      logger.audit({ decision: "rejected", method, reason: "public decrypt failed" });
      throw error;
    }
    const { clearValues, decryptionProof } = decryptResult;
    realCall = operation.buildRealCall({
      contractAddress: to,
      publicArgs,
      clearValues,
      decryptionProof,
    });
  }

  const rewrittenData = encodeFunctionData({
    abi: realCall.abi,
    functionName: realCall.functionName,
    args: realCall.args,
  });

  logger.audit({ decision: "rewritten", method, contractAddress: to, operation: operation.name });

  return { rewritten: true, data: rewrittenData };
}
