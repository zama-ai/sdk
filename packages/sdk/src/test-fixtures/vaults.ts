import { keccak256, pad, toBytes, type Address, type Hex } from "viem";
import { vi } from "vitest";
import { Token } from "../token";
import type { GenericProvider } from "../types";
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
