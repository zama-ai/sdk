import { getAddress } from "viem";
import { ConfigurationError } from "../errors";
import type { RawLog } from "../types/transaction";
import { takeJoined } from "./events";
import type {
  DecodedVaultGroupJoins,
  JoinDelivery,
  PreparedVaultGroupJoin,
  VaultGroupConfig,
  VaultGroupJoin,
  VaultGroupOperator,
} from "./vault-group-types";

// Group functions that need no SDK instance, for a host that has only the config or saved legs.

/**
 * The operator grants a redemption of `config` with `delivery` relies on,
 * from the config alone: the router on every member's `cShare` for
 * `"router"`, none for `"legs"` or a group of one. The same answer as
 * {@link VaultGroup.redeemOperators}, for the parts of a host's transaction
 * pipeline that run with the config in hand but no SDK instance in scope,
 * such as the guard that decides whether a grant transaction is needed.
 *
 * @throws if `delivery` is `"router"` and a member gives no `cShare`, or the config names no router. {@link ConfigurationError}
 */
export function vaultGroupRedeemOperators(
  config: VaultGroupConfig,
  delivery: JoinDelivery = "router",
): readonly VaultGroupOperator[] {
  if (config.vaults.length === 1 || delivery === "legs") {
    return [];
  }
  if (config.router === undefined) {
    throw new ConfigurationError(
      `Vault group "${config.id}" names no router, which a router submission needs`,
    );
  }
  const router = getAddress(config.router);
  return config.vaults.map((member) => {
    if (member.cShare === undefined) {
      throw new ConfigurationError(
        `Vault group "${config.id}" gives no cShare for "${member.id}", which redeemOperators needs; pass it, or use prepareRedeem`,
      );
    }
    return { vaultId: member.id, token: getAddress(member.cShare), spender: router };
  });
}

/**
 * Pair each leg of a submission with its `Joined` log in `logs`: what
 * {@link PreparedVaultGroupJoin.decodeJoins} does, from plain data, so a host
 * that saved the legs and the account can decode after a reload. A leg with
 * no log is reported in `unconfirmed` rather than thrown, so the host decides
 * what a partial match means for its delivery; for a partly sent `"legs"`
 * delivery, those are the legs still to send.
 *
 * @param prepared - The submission's `legs` and `account`.
 * @param logs - Every mined receipt's logs. For a `"legs"` delivery, pass the
 *   receipts in leg order: when the adapter omits log addresses, legs pair
 *   with logs by position.
 */
export function decodeVaultGroupJoins(
  prepared: Pick<PreparedVaultGroupJoin, "legs" | "account">,
  logs: readonly RawLog[],
): DecodedVaultGroupJoins {
  // Each log is consumed once, so the Nth match is the Nth leg's even when
  // the adapter omits log addresses.
  const remaining = [...logs];
  const joins: VaultGroupJoin[] = [];
  const unconfirmed: string[] = [];
  for (const leg of prepared.legs) {
    const joined = takeJoined(remaining, leg.batcher, prepared.account);
    if (!joined) {
      unconfirmed.push(leg.vaultId);
      continue;
    }
    joins.push({
      vaultId: leg.vaultId,
      batcher: leg.batcher,
      token: leg.token,
      batchId: joined.batchId,
      confidentialJoinedAmount: joined.confidentialAmount,
    });
  }
  return { joins, unconfirmed };
}
