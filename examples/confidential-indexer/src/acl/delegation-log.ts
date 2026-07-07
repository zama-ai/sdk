import { getAddress, hexToBigInt, type Address, type Hex, type PublicClient } from "viem";
import type { DelegationRecord } from "./types.js";
import { getRawLogs } from "./raw-logs.js";

/**
 * Topic0 for the ACL's delegation-granted / delegation-revoked events.
 *
 * Not derived from an ABI — the real ACL contract deployed on Sepolia isn't
 * vendored in this repo (only the SDK's own curated, events-free ABI is),
 * so these were captured empirically: a real `delegateForUserDecryption` /
 * `revokeDelegationForUserDecryption` call was made against a local Anvil
 * fork of live Sepolia (no real key or on-chain effect involved) and the
 * emitted log topics were read directly. See WALKTHROUGH.md.
 *
 * Both events index (delegator, delegate) in topics[1]/topics[2]. `data`
 * starts with the confidential token (`contractAddress`) as its first
 * 32-byte word; the exact meaning of the remaining words wasn't verified
 * (no source available) — only `action` (which topic0 fired) is used to
 * decide active/revoked state; see `delegation-store.ts`.
 */
export const DELEGATION_GRANTED_TOPIC =
  "0x527b025d7ff06689c1ab9d32dfd7881c964cce72ce8ac5b2fe1d3be8cfda5bfc" as const;
export const DELEGATION_REVOKED_TOPIC =
  "0x7aca80b6b7928b9038f186e3d9922a0fc5d52c398fbf144725c142c52a5277e4" as const;

function parseLog(log: {
  topics: readonly Hex[];
  data: Hex;
  blockNumber: bigint | null;
  transactionHash: Hex | null;
  logIndex: number | null;
}): DelegationRecord | undefined {
  const [topic0, delegatorTopic, delegateTopic] = log.topics;
  if (!topic0 || !delegatorTopic || !delegateTopic) return undefined;

  const action = topic0 === DELEGATION_GRANTED_TOPIC ? "granted" : "revoked";
  const delegator = getAddress(`0x${delegatorTopic.slice(-40)}`);
  const delegate = getAddress(`0x${delegateTopic.slice(-40)}`);

  const dataHex = log.data.slice(2);
  const firstWord = dataHex.slice(0, 64);
  const lastWord = dataHex.slice(-64);
  const contractAddress = getAddress(`0x${firstWord.slice(-40)}`);
  const expirationDate = hexToBigInt(`0x${lastWord}`);

  return {
    delegator,
    delegate,
    contractAddress,
    expirationDate,
    blockNumber: log.blockNumber ?? 0n,
    transactionHash: log.transactionHash ?? "0x",
    logIndex: log.logIndex ?? 0,
    action,
  };
}

/**
 * Fetches delegation grant/revoke logs for a given delegate address, over
 * a block range, paginated in chunks — public Sepolia RPC providers cap
 * `eth_getLogs` ranges (observed limits: 10,000–50,000 blocks depending on
 * provider), so a single unbounded query isn't reliable.
 */
export async function fetchDelegationLogs(params: {
  publicClient: PublicClient;
  aclAddress: Address;
  delegateAddress: Address;
  fromBlock: bigint;
  toBlock: bigint;
  chunkSize?: bigint;
}): Promise<DelegationRecord[]> {
  const { publicClient, aclAddress, delegateAddress, fromBlock, toBlock } = params;
  const chunkSize = params.chunkSize ?? 9_000n;
  const delegateTopic = `0x${delegateAddress.slice(2).toLowerCase().padStart(64, "0")}` as Hex;

  const records: DelegationRecord[] = [];
  for (let start = fromBlock; start <= toBlock; start += chunkSize + 1n) {
    const end = start + chunkSize > toBlock ? toBlock : start + chunkSize;
    const logs = await getRawLogs({
      publicClient,
      address: aclAddress,
      fromBlock: start,
      toBlock: end,
      topics: [[DELEGATION_GRANTED_TOPIC, DELEGATION_REVOKED_TOPIC], null, delegateTopic],
    });
    for (const log of logs) {
      const record = parseLog(log);
      if (record) records.push(record);
    }
  }

  return records.sort((a, b) =>
    a.blockNumber === b.blockNumber
      ? a.logIndex - b.logIndex
      : Number(a.blockNumber - b.blockNumber),
  );
}
