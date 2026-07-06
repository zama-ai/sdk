import { describe, expect, it } from "vitest";
import { DelegationStore } from "../../src/indexer/delegation-store.js";
import { BalanceStore } from "../../src/indexer/balance-store.js";
import { TransferStore } from "../../src/indexer/transfer-store.js";
import { handleRequest, type RouterDeps } from "../../src/api/router.js";

const CONTRACT = "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639" as const;
const DELEGATOR = "0x72059F5569B6c7ab165Bf05a280f2F870C73b4f8" as const;
const DELEGATE = "0x89c4580764f8e31B5c1B045392fE3B7f2C083584" as const;

function makeDeps(overrides: Partial<RouterDeps> = {}): RouterDeps {
  return {
    delegationStore: new DelegationStore(),
    balanceStore: new BalanceStore(),
    transferStore: new TransferStore(),
    apiKey: undefined,
    ...overrides,
  };
}

describe("handleRequest — auth", () => {
  it("allows unauthenticated /health regardless of apiKey", async () => {
    const response = await handleRequest(
      { method: "GET", path: "/health", headers: {} },
      makeDeps({ apiKey: "secret" }),
    );
    expect(response.status).toBe(200);
  });

  it("rejects protected routes without the bearer token when an apiKey is configured", async () => {
    const response = await handleRequest(
      { method: "GET", path: "/delegations", headers: {} },
      makeDeps({ apiKey: "secret" }),
    );
    expect(response.status).toBe(401);
  });

  it("accepts protected routes with the correct bearer token", async () => {
    const response = await handleRequest(
      { method: "GET", path: "/delegations", headers: { authorization: "Bearer secret" } },
      makeDeps({ apiKey: "secret" }),
    );
    expect(response.status).toBe(200);
  });

  it("allows protected routes with no auth at all when no apiKey is configured", async () => {
    const response = await handleRequest(
      { method: "GET", path: "/delegations", headers: {} },
      makeDeps({ apiKey: undefined }),
    );
    expect(response.status).toBe(200);
  });
});

describe("handleRequest — balances", () => {
  it("returns 403 when there is no known active delegation for the account/token", async () => {
    const response = await handleRequest(
      { method: "GET", path: `/balances/${CONTRACT}/${DELEGATOR}`, headers: {} },
      makeDeps(),
    );
    expect(response.status).toBe(403);
  });

  it("returns 202 pending when delegated but not yet decrypted", async () => {
    const delegationStore = new DelegationStore();
    delegationStore.apply([
      {
        delegator: DELEGATOR,
        delegate: DELEGATE,
        contractAddress: CONTRACT,
        expirationDate: 2n ** 64n - 1n,
        blockNumber: 1n,
        transactionHash: "0xabc",
        logIndex: 0,
        action: "granted",
      },
    ]);
    const response = await handleRequest(
      { method: "GET", path: `/balances/${CONTRACT}/${DELEGATOR}`, headers: {} },
      makeDeps({ delegationStore }),
    );
    expect(response.status).toBe(202);
  });

  it("returns the cached balance once decrypted", async () => {
    const delegationStore = new DelegationStore();
    delegationStore.apply([
      {
        delegator: DELEGATOR,
        delegate: DELEGATE,
        contractAddress: CONTRACT,
        expirationDate: 2n ** 64n - 1n,
        blockNumber: 1n,
        transactionHash: "0xabc",
        logIndex: 0,
        action: "granted",
      },
    ]);
    const balanceStore = new BalanceStore();
    balanceStore.upsert({
      delegator: DELEGATOR,
      contractAddress: CONTRACT,
      handle: "0xhandle",
      clearValue: 97_001021n,
      decryptedAtBlock: 42n,
    });

    const response = await handleRequest(
      { method: "GET", path: `/balances/${CONTRACT}/${DELEGATOR}`, headers: {} },
      makeDeps({ delegationStore, balanceStore }),
    );
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ clearValue: "97001021" });
  });

  it("rejects malformed addresses with 400", async () => {
    const response = await handleRequest(
      { method: "GET", path: "/balances/not-an-address/also-not", headers: {} },
      makeDeps(),
    );
    expect(response.status).toBe(400);
  });
});

describe("handleRequest — unknown routes", () => {
  it("returns 404 for unmatched paths", async () => {
    const response = await handleRequest({ method: "GET", path: "/nope", headers: {} }, makeDeps());
    expect(response.status).toBe(404);
  });
});
