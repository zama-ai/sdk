import { toHex, type Address, type Hex, type PublicClient } from "viem";

export interface RawLog {
  address: Address;
  topics: readonly Hex[];
  data: Hex;
  blockNumber: bigint;
  transactionHash: Hex;
  logIndex: number;
}

/**
 * Raw `eth_getLogs`, bypassing viem's typed `getLogs` action — that action
 * only builds a topic filter from a full ABI `event`/`events` definition.
 * We know the exact topic0 (and topic1/topic2 for filtering) values,
 * verified empirically against real transactions (see `delegation-log.ts` /
 * `transfer-log.ts`), but not a full event ABI (no contract source
 * available for these events) — so raw topics have to be passed directly.
 */
export async function getRawLogs(params: {
  publicClient: PublicClient;
  address: Address;
  fromBlock: bigint;
  toBlock: bigint;
  topics: (Hex | Hex[] | null)[];
}): Promise<RawLog[]> {
  const { publicClient, address, fromBlock, toBlock, topics } = params;
  const logs = await publicClient.request({
    method: "eth_getLogs",
    params: [{ address, fromBlock: toHex(fromBlock), toBlock: toHex(toBlock), topics }],
  });

  return logs.map((log) => ({
    address: log.address,
    topics: log.topics,
    data: log.data,
    blockNumber: BigInt(log.blockNumber ?? "0x0"),
    transactionHash: log.transactionHash ?? "0x",
    logIndex: Number(log.logIndex ?? "0x0"),
  }));
}
