import { getAddress, keccak256, pad, toBytes, type Address, type Hex } from "viem";
import { vi } from "vitest";
import type { EncryptedValue, RelayerSDK } from "../relayer/types";
import { Token } from "../token";
import type { GenericProvider } from "../types";
import { VALID_INPUT_PROOF } from "./constants";
import type { RawLog } from "../types/transaction";

const JOINED_TOPIC = keccak256(toBytes("Joined(uint256,address,bytes32)"));

/** A `Joined(uint256 indexed batchId, address indexed account, euint64 amount)` log. */
export function joinedLog(params: {
  batcher: Address;
  batchId: bigint;
  account: Address;
  confidentialAmount?: Hex;
}): RawLog {
  return {
    address: params.batcher,
    topics: [
      JOINED_TOPIC,
      pad(`0x${params.batchId.toString(16)}`, { size: 32 }),
      pad(params.account, { size: 32 }),
    ],
    data: params.confidentialAmount ?? (`0x${"ab".repeat(32)}` as Hex),
  };
}

/** A join reads its batch id back out of the receipt and throws without this. */
export function mockJoinReceipt(
  provider: GenericProvider,
  params: { batcher: Address; account: Address; batchId?: bigint },
): void {
  vi.mocked(provider.waitForTransactionReceipt).mockResolvedValue({
    logs: [joinedLog({ ...params, batchId: params.batchId ?? 12n })],
  });
}

/**
 * A join pre-flights the caller's balance on `fromToken` and throws without this.
 * Pass `vault` when joining through a `Vault`, which also checks both batchers report it.
 */
export function mockJoinBalance(
  provider: GenericProvider,
  params: { fromToken: Address; vault?: Address; balance?: bigint },
): void {
  vi.mocked(provider.readContract).mockImplementation(async (config) =>
    config.functionName === "vault" && params.vault ? params.vault : params.fromToken,
  );
  vi.spyOn(Token.prototype, "balanceOf").mockResolvedValue(params.balance ?? 1_000_000_000n);
}

/**
 * Answers `currentBatchId` per batcher. Any other read, or a batcher the table
 * does not name, throws rather than returning a default, so a test that reaches
 * further than it meant to fails loudly.
 */
export function mockCurrentBatchIds(
  provider: GenericProvider,
  batchIds: Readonly<Record<Address, bigint>>,
): void {
  vi.mocked(provider.readContract).mockImplementation(async (call: unknown) => {
    const { address, functionName } = call as { address: Address; functionName: string };
    if (functionName !== "currentBatchId") {
      throw new Error(`mockCurrentBatchIds was asked for ${functionName}`);
    }
    const batchId = batchIds[getAddress(address)];
    if (batchId === undefined) {
      throw new Error(`mockCurrentBatchIds has no batch id for ${address}`);
    }
    return batchId;
  });
}

/**
 * One encrypt returning `count` distinct handles under a single proof, in leg
 * order — the shape a fan-out submits.
 *
 * The relayer's handle type is branded, so the cast lives here rather than at
 * every call site.
 */
export function mockEncryptedLegs(relayer: RelayerSDK, count: number): readonly EncryptedValue[] {
  const handles = Array.from(
    { length: count },
    (_unused, index) =>
      `0x${(index + 1).toString(16).padStart(2, "0").repeat(32)}` as EncryptedValue,
  );
  vi.mocked(relayer.encryptValues).mockResolvedValue({
    encryptedValues: handles,
    inputProof: VALID_INPUT_PROOF,
  } as unknown as Awaited<ReturnType<RelayerSDK["encryptValues"]>>);
  return handles;
}
