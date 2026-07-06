import { describe, expect, it } from "vitest";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { fetchDelegationLogs } from "../../src/acl/delegation-log.js";

/**
 * Real end-to-end test: queries actual historical logs on live Sepolia —
 * no mocking, no fork. Targets a delegation grant this session confirmed
 * exists on-chain (block 11193387, `cast logs` against the real ACL
 * contract — see WALKTHROUGH.md), to prove the parser and topic filters
 * work against real production data, not just synthetic fixtures.
 */
const RPC_URL = process.env.SEPOLIA_RPC_URL ?? "https://sepolia.drpc.org";
const ACL_ADDRESS = "0xf0Ffdc93b7E186bC2f8CB3dAA75D86d1930A433D" as const;
const KNOWN_DELEGATE = "0x89c4580764f8e31B5c1B045392fE3B7f2C083584" as const;
const KNOWN_DELEGATOR = "0x72059F5569B6c7ab165Bf05a280f2F870C73b4f8" as const;
const KNOWN_CONTRACT = "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639" as const;
const KNOWN_BLOCK = 11193387n;

describe("fetchDelegationLogs — real Sepolia data", () => {
  it("finds the known real delegation grant with correctly parsed fields", async () => {
    const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });

    const records = await fetchDelegationLogs({
      publicClient,
      aclAddress: ACL_ADDRESS,
      delegateAddress: KNOWN_DELEGATE,
      fromBlock: KNOWN_BLOCK - 100n,
      toBlock: KNOWN_BLOCK + 100n,
    });

    const found = records.find((r) => r.blockNumber === KNOWN_BLOCK);
    expect(found).toBeDefined();
    expect(found?.delegator).toBe(KNOWN_DELEGATOR);
    expect(found?.delegate).toBe(KNOWN_DELEGATE);
    expect(found?.contractAddress).toBe(KNOWN_CONTRACT);
    expect(found?.action).toBe("granted");
    // Memory: "2 délégations permanentes" — permanent grants use MAX_UINT64.
    expect(found?.expirationDate).toBe(2n ** 64n - 1n);
  }, 30_000);
});
