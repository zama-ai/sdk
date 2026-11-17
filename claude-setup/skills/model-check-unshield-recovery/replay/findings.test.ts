// Replays the model's known counterexamples against the real WrappedToken.
// Each test passes while the finding still exists in the code. When a test
// fails, the code changed: update the model, then this file (see SKILL.md).
import { ZamaErrorCode } from "../../../../packages/sdk/src/errors";
import { Topics } from "../../../../packages/sdk/src/events";
import { describe, expect, test, vi } from "../../../../packages/sdk/src/test-fixtures";
import type {
  GenericProvider,
  GenericSigner,
  TransactionReceipt,
} from "../../../../packages/sdk/src/types";

// The repo root does not depend on viem, so its types and values are spelled out here.
type Hex = `0x${string}`;
type Address = `0x${string}`;
const zeroAddress: Address = `0x${"0".repeat(40)}`;

// An in-memory wrapper: unwrap opens a request (mined at once), finalizeUnwrap
// deletes it, unwrapRequester reads it. Mirrors ERC7984ERC20WrapperUpgradeable.
function fakeWrapper(signer: GenericSigner, provider: GenericProvider, userAddress: Address) {
  const open = new Map<Hex, Address>();
  const receipts = new Map<Hex, TransactionReceipt>();
  const failingReceipts = new Set<Hex>();
  let txCount = 0;

  vi.mocked(signer.writeContract).mockImplementation(async (config) => {
    txCount += 1;
    const txHash = `0x${txCount.toString(16).padStart(64, "0")}` as Hex;
    if (config.functionName === "unwrap") {
      const requestId = `0x${(0xa0 + txCount).toString(16).repeat(32)}` as Hex;
      open.set(requestId, userAddress);
      receipts.set(txHash, {
        logs: [
          {
            topics: [
              Topics.UnwrapRequested,
              `0x000000000000000000000000${userAddress.slice(2)}`,
              requestId,
            ],
            data: requestId,
          },
        ],
      });
    } else if (config.functionName === "finalizeUnwrap") {
      const requestId = (config.args as readonly unknown[])[0] as Hex;
      if (!open.delete(requestId)) {
        throw new Error('The contract reverted with custom error "InvalidUnwrapRequest".');
      }
      receipts.set(txHash, { logs: [] });
    }
    return txHash;
  });

  vi.mocked(provider.waitForTransactionReceipt).mockImplementation(async (hash: Hex) => {
    if (failingReceipts.has(hash)) {
      throw new Error("timed out waiting for the transaction receipt");
    }
    return receipts.get(hash) ?? { logs: [] };
  });

  vi.mocked(provider.readContract).mockImplementation(async (config) => {
    if (config.functionName === "unwrapRequester") {
      return open.get((config.args as readonly unknown[])[0] as Hex) ?? zeroAddress;
    }
    throw new Error(`unexpected read ${config.functionName}`);
  });

  return {
    openRequests: () => [...open.keys()],
    // The next tx's receipt wait throws (RPC timeout, tab closed mid-wait).
    failNextReceipt: () => failingReceipts.add(`0x${(txCount + 1).toString(16).padStart(64, "0")}`),
  };
}

describe("unshield recovery findings", () => {
  test("unsaved window: a failed unwrap receipt wait leaves an open request that getPendingUnshield cannot see", async ({
    signer,
    provider,
    userAddress,
    wrappedToken,
  }) => {
    const chain = fakeWrapper(signer, provider, userAddress);
    chain.failNextReceipt();

    await expect(wrappedToken.unshield(50n, { skipBalanceCheck: true })).rejects.toMatchObject({
      code: ZamaErrorCode.TransactionReverted,
    });

    expect(chain.openRequests()).toHaveLength(1);
    expect(await wrappedToken.getPendingUnshield()).toBeNull();
  });

  test("one pointer per wrapper: a second unshield erases the pointer of an unfinished first one", async ({
    signer,
    provider,
    relayer,
    userAddress,
    wrappedToken,
  }) => {
    const chain = fakeWrapper(signer, provider, userAddress);

    // First unshield: phase 1 lands, phase 2 fails (public decryption errors).
    vi.mocked(relayer.decryptPublicValuesWithSignatures).mockRejectedValueOnce(
      new Error("relayer unavailable"),
    );
    await expect(wrappedToken.unshield(50n, { skipBalanceCheck: true })).rejects.toThrow();
    const [first] = chain.openRequests();
    expect(first).toBeDefined();
    expect(await wrappedToken.getPendingUnshield()).not.toBeNull();

    // Second unshield on the same wrapper completes.
    await wrappedToken.unshield(20n, { skipBalanceCheck: true });

    // The first request is still open on-chain, but the SDK no longer reports it.
    expect(chain.openRequests()).toEqual([first]);
    expect(await wrappedToken.getPendingUnshield()).toBeNull();
  });
});
