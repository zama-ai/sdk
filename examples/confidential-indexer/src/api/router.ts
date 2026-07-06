import { getAddress, isAddress } from "viem";
import type { DelegationStore } from "../indexer/delegation-store.js";
import type { BalanceStore } from "../indexer/balance-store.js";
import type { TransferStore } from "../indexer/transfer-store.js";
import { isAuthorized } from "./auth.js";

export interface RouterDeps {
  delegationStore: DelegationStore;
  balanceStore: BalanceStore;
  transferStore: TransferStore;
  apiKey: string | undefined;
}

export interface HandlerRequest {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
}

export interface HandlerResponse {
  status: number;
  body: unknown;
}

function toJsonSafe(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v)));
}

/**
 * Deliberately decoupled from `node:http` (see `server.ts` for the thin
 * adapter) — same rationale as `zama-json-rpc`'s router: testable directly
 * with plain objects, no server to spin up for unit tests.
 *
 * Route shape is a REST query API, not JSON-RPC — this service answers
 * "what do I already know, decrypted, for this account" from a cache; it
 * never proxies or rewrites Ethereum RPC calls the way the write-side
 * wrapper does.
 */
export async function handleRequest(
  req: HandlerRequest,
  deps: RouterDeps,
): Promise<HandlerResponse> {
  const segments = req.path.split("/").filter(Boolean);

  if (req.method === "GET" && segments.length === 0) {
    return { status: 200, body: { name: "confidential-indexer", status: "ok" } };
  }
  if (req.method === "GET" && segments[0] === "health") {
    return { status: 200, body: { status: "ok" } };
  }

  if (!isAuthorized(req, deps.apiKey)) {
    return { status: 401, body: { error: "Unauthorized" } };
  }

  if (req.method === "GET" && segments[0] === "delegations" && segments.length === 1) {
    return {
      status: 200,
      body: {
        delegations: toJsonSafe(
          deps.delegationStore
            .list()
            .map((d) => ({
              delegator: d.delegator,
              contractAddress: d.contractAddress,
              expirationDate: d.expirationDate,
            })),
        ),
      },
    };
  }

  if (req.method === "GET" && segments[0] === "balances" && segments.length === 3) {
    const [, contractAddressRaw, accountRaw] = segments;
    if (
      !contractAddressRaw ||
      !accountRaw ||
      !isAddress(contractAddressRaw) ||
      !isAddress(accountRaw)
    ) {
      return { status: 400, body: { error: "Invalid address" } };
    }
    const contractAddress = getAddress(contractAddressRaw);
    const account = getAddress(accountRaw);

    if (!deps.delegationStore.isKnownActive(account, contractAddress)) {
      return { status: 403, body: { error: "No known active delegation for this account/token" } };
    }
    const snapshot = deps.balanceStore.get(account, contractAddress);
    if (!snapshot) {
      return {
        status: 202,
        body: { status: "pending", message: "Delegation known, balance not decrypted yet" },
      };
    }
    return { status: 200, body: toJsonSafe(snapshot) };
  }

  if (req.method === "GET" && segments[0] === "transfers" && segments.length === 3) {
    const [, contractAddressRaw, accountRaw] = segments;
    if (
      !contractAddressRaw ||
      !accountRaw ||
      !isAddress(contractAddressRaw) ||
      !isAddress(accountRaw)
    ) {
      return { status: 400, body: { error: "Invalid address" } };
    }
    const contractAddress = getAddress(contractAddressRaw);
    const account = getAddress(accountRaw);

    if (!deps.delegationStore.isKnownActive(account, contractAddress)) {
      return { status: 403, body: { error: "No known active delegation for this account/token" } };
    }
    return {
      status: 200,
      body: { transfers: toJsonSafe(deps.transferStore.listFor(contractAddress, account)) },
    };
  }

  return { status: 404, body: { error: "Not Found" } };
}
