import type { JoinRecord, Leg, Position, PositionPhase, VaultAction } from "./types";

function phaseOf(legs: readonly Leg[]): PositionPhase {
  if (legs.some((leg) => leg.state === "dispatched")) {
    return "settling";
  }
  // Exits leave an encrypted zero, so only a decrypted read can tell an exited position.
  if (legs.every((leg) => leg.amount === 0n)) {
    return "closed";
  }
  return legs.every((leg) => leg.state === "pending") ? "queued" : "ready";
}

function actionsOf(legs: readonly Leg[], phase: PositionPhase, now: bigint): VaultAction[] {
  if (phase === "settling") {
    return ["finalize"];
  }
  if (phase === "closed") {
    return [];
  }
  const dispatchable = legs.some(
    (leg) => leg.state === "pending" && !leg.paused && leg.dispatchableAt <= now,
  );
  return dispatchable ? ["exit", "dispatch"] : ["exit"];
}

function nextChangeOf(legs: readonly Leg[], now: bigint): bigint | null {
  let next: bigint | null = null;
  for (const leg of legs) {
    const at =
      leg.state === "pending"
        ? leg.dispatchableAt
        : leg.state === "dispatched"
          ? leg.cancelsAt
          : null;
    if (at !== null && at > now && (next === null || at < next)) {
      next = at;
    }
  }
  return next;
}

/**
 * The position state machine over legs already read. Pure, so a host whose
 * indexer has the batch facts can compute a position without an RPC call.
 *
 * @internal
 */
export function toPosition<TGroupId extends string, TVaultId extends string>(
  record: JoinRecord<TGroupId, TVaultId>,
  legs: readonly Leg<TVaultId>[],
  now: bigint,
): Position<TGroupId, TVaultId> {
  const phase = phaseOf(legs);
  const funded = legs.filter((leg) => leg.amount !== null && leg.amount > 0n);
  return {
    record,
    phase,
    legs,
    availableActions: actionsOf(legs, phase, now),
    chosenVaultId: funded.length === 1 ? (funded[0]?.vaultId ?? null) : null,
    observedAt: now,
    nextChangeAt: nextChangeOf(legs, now),
  };
}
