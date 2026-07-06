import { decodeFunctionData, encodeFunctionData, type Hex } from "viem";
import type { ZamaSDK } from "@zama-fhe/sdk";
import type { ConfidentialOperationRegistry } from "../registry/index.js";
import type { Logger } from "../logging/logger.js";
import { redactPublicArgs } from "../logging/redact.js";
import type { EthTransactionParams } from "./eth-transaction.js";
import { InvalidRewriteRequestError } from "./errors.js";

export interface RewriteResult {
  rewritten: boolean;
  data: Hex;
}

/**
 * The core auto-magic: if `tx` matches a known confidential *operation*
 * shape (by selector) AND `tx.to` is a genuine, on-chain-registered
 * confidential token (`sdk.registry.isConfidentialTokenValid` — Zama's own
 * wrappers registry, not a locally configured address list), decode the
 * plaintext args, encrypt the marked argument via the Zama SDK, and
 * re-encode the real on-chain calldata. Otherwise, pass the calldata
 * through unchanged.
 *
 * Every request that reaches here hits exactly one `logger.audit(...)`
 * call, so operators can verify the rewrite never applies outside a
 * confirmed confidential token.
 */
export async function maybeRewriteTransaction(params: {
  sdk: ZamaSDK;
  registry: ConfidentialOperationRegistry;
  chainId: number;
  tx: EthTransactionParams;
  logger: Logger;
}): Promise<RewriteResult> {
  const { sdk, registry, chainId, tx, logger } = params;

  if (!tx.to || !tx.data || tx.data === "0x") {
    logger.audit({ decision: "passthrough", method: "eth_sendTransaction" });
    return { rewritten: false, data: tx.data ?? "0x" };
  }

  const operation = registry.find(chainId, tx.data);
  if (!operation) {
    logger.audit({ decision: "passthrough", method: "eth_sendTransaction" });
    return { rewritten: false, data: tx.data };
  }

  let isValidConfidentialToken: boolean;
  try {
    isValidConfidentialToken = await sdk.registry.isConfidentialTokenValid(tx.to);
  } catch (error) {
    logger.audit({
      decision: "rejected",
      method: "eth_sendTransaction",
      reason: "registry lookup failed",
    });
    // Fail closed: never guess. A lookup failure must not silently fall
    // through as either a rewrite or a pass-through.
    throw new InvalidRewriteRequestError(
      `Could not verify whether ${tx.to} is a registered confidential token — registry lookup ` +
        `failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!isValidConfidentialToken) {
    logger.audit({ decision: "passthrough", method: "eth_sendTransaction" });
    return { rewritten: false, data: tx.data };
  }

  if (!tx.from) {
    logger.audit({
      decision: "rejected",
      method: "eth_sendTransaction",
      reason: "missing 'from' address",
    });
    throw new InvalidRewriteRequestError(
      `Cannot auto-encrypt for "${operation.name}" on ${tx.to}: the request has no "from" address. ` +
        'Encrypted inputs are bound to the sender for the FHE input proof — see WALKTHROUGH.md ("known limitations").',
    );
  }

  const { args } = decodeFunctionData({ abi: operation.publicAbi, data: tx.data });
  const publicArgs = args ?? [];

  logger.debug(
    `Matched "${operation.name}" for ${tx.to} — decoded public args: ${JSON.stringify(
      redactPublicArgs(publicArgs),
    )}`,
  );

  const encryptedInput = operation.extractEncryptedInput(publicArgs);
  const { encryptedValues, inputProof } = await sdk.encrypt({
    values: [encryptedInput],
    contractAddress: tx.to,
    userAddress: tx.from,
  });

  const encryptedValue = encryptedValues[0];
  if (!encryptedValue) {
    throw new Error(`sdk.encrypt() returned no encrypted value for "${operation.name}"`);
  }

  const realCall = operation.buildRealCall({
    contractAddress: tx.to,
    publicArgs,
    encryptedValue,
    inputProof,
  });
  const rewrittenData = encodeFunctionData({
    abi: realCall.abi,
    functionName: realCall.functionName,
    args: realCall.args,
  });

  logger.audit({
    decision: "rewritten",
    method: "eth_sendTransaction",
    contractAddress: tx.to,
    operation: operation.name,
  });

  return { rewritten: true, data: rewrittenData };
}
