import { getAddress, type Address, type Hex, type PublicClient } from "viem";
import { getRawLogs } from "./raw-logs.js";

/**
 * Topic0 for `ConfidentialTransfer(address indexed from, address indexed
 * to, euint64 indexed amount)`. Confirmed empirically, not derived from an
 * ABI: a real `confidentialTransfer` call was made (in the sibling
 * `zama-json-rpc` project's Anvil-fork test, see its WALKTHROUGH.md) and
 * the emitted log matched exactly — 3 indexed topics beyond topic0, empty
 * `data` (no non-indexed fields), consistent with the standard's 3-indexed-param
 * signature.
 */
export const CONFIDENTIAL_TRANSFER_TOPIC =
  "0x67500e8d0ed826d2194f514dd0d8124f35648ab6e3fb5e6ed867134cffe661e9" as const;

export interface ConfidentialTransferRecord {
  contractAddress: Address;
  from: Address;
  to: Address;
  amountHandle: Hex;
  blockNumber: bigint;
  transactionHash: Hex;
  logIndex: number;
}

function parseLog(log: {
  address: Address;
  topics: readonly Hex[];
  blockNumber: bigint | null;
  transactionHash: Hex | null;
  logIndex: number | null;
}): ConfidentialTransferRecord | undefined {
  const [, fromTopic, toTopic, amountTopic] = log.topics;
  if (!fromTopic || !toTopic || !amountTopic) return undefined;

  return {
    contractAddress: log.address,
    from: getAddress(`0x${fromTopic.slice(-40)}`),
    to: getAddress(`0x${toTopic.slice(-40)}`),
    amountHandle: amountTopic,
    blockNumber: log.blockNumber ?? 0n,
    transactionHash: log.transactionHash ?? "0x",
    logIndex: log.logIndex ?? 0,
  };
}

/**
 * Fetches `ConfidentialTransfer` logs for `account` (as either `from` or
 * `to`) on `contractAddress`, paginated to respect public-RPC `eth_getLogs`
 * range caps. Two separate queries — `topics` array positions are AND'd
 * together, so "from OR to" can't be expressed as a single filter.
 */
export async function fetchConfidentialTransfers(params: {
  publicClient: PublicClient;
  contractAddress: Address;
  account: Address;
  fromBlock: bigint;
  toBlock: bigint;
  chunkSize?: bigint;
}): Promise<ConfidentialTransferRecord[]> {
  const { publicClient, contractAddress, account, fromBlock, toBlock } = params;
  const chunkSize = params.chunkSize ?? 9_000n;
  const accountTopic = `0x${account.slice(2).toLowerCase().padStart(64, "0")}` as Hex;

  const records: ConfidentialTransferRecord[] = [];
  for (let start = fromBlock; start <= toBlock; start += chunkSize + 1n) {
    const end = start + chunkSize > toBlock ? toBlock : start + chunkSize;

    const [asSender, asRecipient] = await Promise.all([
      getRawLogs({
        publicClient,
        address: contractAddress,
        fromBlock: start,
        toBlock: end,
        topics: [CONFIDENTIAL_TRANSFER_TOPIC, accountTopic],
      }),
      getRawLogs({
        publicClient,
        address: contractAddress,
        fromBlock: start,
        toBlock: end,
        topics: [CONFIDENTIAL_TRANSFER_TOPIC, null, accountTopic],
      }),
    ]);

    for (const log of [...asSender, ...asRecipient]) {
      const record = parseLog(log);
      if (record) records.push(record);
    }
  }

  const seen = new Set<string>();
  return records
    .filter((record) => {
      const dedupeKey = `${record.transactionHash}:${record.logIndex}`;
      if (seen.has(dedupeKey)) return false;
      seen.add(dedupeKey);
      return true;
    })
    .sort((a, b) =>
      a.blockNumber === b.blockNumber
        ? a.logIndex - b.logIndex
        : Number(a.blockNumber - b.blockNumber),
    );
}
