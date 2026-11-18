// The shared world that the SDK calls race on: one storage and one wrapper on
// one chain, used by one account. For each pending call it lists every answer
// the real wallet, RPC, storage or relayer could give, the world state in
// which each answer is possible, and what it changes. A fake that answers
// something the real one cannot is a harness error, not a finding.
import type { Hex } from "viem";
import type { PendingUnshieldRequest } from "../../pending-unshield";
import { HarnessError, USER, type Answer, type Call, type ReceiptAnswer } from "./sdk-call";

const ZERO_ADDRESS = `0x${"0".repeat(40)}`;

export type TxStatus = "pending" | "success" | "reverted";

export interface Tx {
  readonly hash: Hex;
  readonly kind: "unwrap" | "finalize";
  readonly requestId: Hex;
  readonly status: TxStatus;
}

export interface World {
  /** The pending-unshield entries as stored JSON, or undefined. */
  readonly stored: string | undefined;
  /** Every transaction the wallet sent, in send (nonce) order. */
  readonly txs: readonly Tx[];
  /** Requests that ever had a stored entry. */
  readonly saved: readonly Hex[];
  /** Requests whose entry a write based on a stale read dropped (two tabs wrote at once). */
  readonly lostUpdate: readonly Hex[];
  /** Requests whose unshield call ended before saving an entry, with where it ended. */
  readonly unsaved: readonly { requestId: Hex; endedOn: Call["kind"] | "storage failure" }[];
}

export const EMPTY_WORLD: World = {
  stored: undefined,
  txs: [],
  saved: [],
  lostUpdate: [],
  unsaved: [],
};

// Actor k sends at most one unwrap (Uk) and one finalizeUnwrap (Fk); Uk opens request reqk.
const word = (tail: string): Hex => `0x${tail.padStart(64, "0")}`;
export const unwrapTx = (slot: number): Hex => word(`a${slot}`);
export const finalizeTx = (slot: number): Hex => word(`f${slot}`);
export const requestOf = (slot: number): Hex => word(`e${slot}`);

/** An earlier unshield (U0) is open on chain with its entry saved, and its tab is gone. */
export const INTERRUPTED_WORLD: World = {
  ...EMPTY_WORLD,
  stored: JSON.stringify({ version: 2, requests: [{ unwrapTxHash: unwrapTx(0) }] }),
  txs: [{ hash: unwrapTx(0), kind: "unwrap", requestId: requestOf(0), status: "success" }],
  saved: [requestOf(0)],
};
export const isUnwrapTx = (hash: Hex) => /^0x0+a\d+$/.test(hash);

/** Short names for the hex values in step labels: U1, F1, req1, ... */
export function pretty(text: string): string {
  return text.replace(/0x0{61,62}([aef])(\d+)/g, (_, kind: string, slot: string) => {
    const name = kind === "a" ? "U" : kind === "f" ? "F" : "req";
    return `${name}${slot}`;
  });
}

export function requestStatus(world: World, requestId: Hex): "none" | "open" | "finalized" {
  const mined = (kind: Tx["kind"]) =>
    world.txs.some(
      (tx) => tx.kind === kind && tx.requestId === requestId && tx.status === "success",
    );
  if (mined("finalize")) {
    return "finalized";
  }
  return mined("unwrap") ? "open" : "none";
}

export function requestOfTx(world: World, hash: Hex | undefined): Hex | undefined {
  return world.txs.find((tx) => tx.hash === hash)?.requestId;
}

export function parseEntries(json: string | null | undefined): PendingUnshieldRequest[] {
  if (json === null || json === undefined) {
    return [];
  }
  const value = JSON.parse(json) as { version?: number; requests?: PendingUnshieldRequest[] };
  if (value.version !== 2 || !Array.isArray(value.requests)) {
    throw new HarnessError(`unexpected pending-unshield value ${json}`);
  }
  return value.requests;
}

/** The requests that `json` has an entry for. */
export function storedRequests(world: World, json: string | null | undefined): Hex[] {
  return parseEntries(json).map((entry) => {
    const requestId = requestOfTx(world, entry.unwrapTxHash);
    if (!requestId || (entry.unwrapRequestId && entry.unwrapRequestId !== requestId)) {
      throw new HarnessError(`entry ${JSON.stringify(entry)} does not match its unwrap tx`);
    }
    return requestId;
  });
}

function storedLabel(json: string | null | undefined): string {
  const entries = parseEntries(json).map(
    (e) => `${e.unwrapTxHash}${e.unwrapRequestId ? `+${e.unwrapRequestId}` : ""}`,
  );
  return entries.length === 0 ? "empty" : pretty(`[${entries.join(", ")}]`);
}

export function callLabel(call: Call): string {
  switch (call.kind) {
    case "storage.get":
    case "storage.delete":
      return `${call.kind}(pending-unshield)`;
    case "storage.set":
      return `storage.set(pending-unshield, ${storedLabel(call.value)})`;
    case "signer.writeContract":
      return pretty(
        `signer.writeContract(${call.functionName}${call.requestId ? ` ${call.requestId}` : ""})`,
      );
    case "provider.waitForTransactionReceipt":
      return pretty(`provider.waitForTransactionReceipt(${call.hash})`);
    case "provider.readContract":
      return pretty(`provider.readContract(${call.functionName} ${call.requestId})`);
    case "relayer.decryptPublicValuesWithSignatures":
      return pretty(
        `relayer.decryptPublicValuesWithSignatures(${call.encryptedValues.join(", ")})`,
      );
  }
  throw new HarnessError(`unknown call ${JSON.stringify(call)}`);
}

export interface Option {
  answer: Answer;
  /** How the step reads in a path, after the call label. */
  text: string;
  /** The answer is possible only in a world where this holds. Absent: always possible. */
  when?: (world: World) => boolean;
  apply?: (world: World) => World;
}

const fail = (message: string, text = `throws (${message})`): Option => ({
  answer: { kind: "throw", message },
  text,
});
const CLOSE: Option = { answer: { kind: "close" }, text: "" };

function send(slot: number, kind: Tx["kind"], requestId: Hex): Option {
  const hash = kind === "unwrap" ? unwrapTx(slot) : finalizeTx(slot);
  return {
    answer: { kind: "ok", value: hash },
    text: pretty(`-> sends ${hash}`),
    apply: (world) => {
      if (world.txs.some((tx) => tx.hash === hash)) {
        throw new HarnessError(`actor ${slot} sent a second ${kind} transaction`);
      }
      return { ...world, txs: [...world.txs, { hash, kind, requestId, status: "pending" }] };
    },
  };
}

const isOpen = (requestId: Hex) => (world: World) => requestStatus(world, requestId) === "open";
const txStatus = (hash: Hex, status: TxStatus) => (world: World) =>
  world.txs.some((tx) => tx.hash === hash && tx.status === status);

/**
 * Every answer the real dependency could give to `call` made by actor `slot`
 * in `world`. An answer with `when` is possible only where `when` holds.
 */
export function options(call: Call, slot: number, world: World): Option[] {
  switch (call.kind) {
    case "storage.get":
      return [
        {
          answer: { kind: "ok", value: world.stored ?? null },
          text: `-> ${storedLabel(world.stored)}`,
        },
        fail("storage unavailable"),
        CLOSE,
      ];
    case "storage.set": {
      const ok: Option = {
        answer: { kind: "ok" },
        text: "ok",
        apply: (world) => ({
          ...world,
          stored: call.value,
          saved: [...new Set([...world.saved, ...storedRequests(world, call.value)])].sort(),
        }),
      };
      return [ok, fail("storage unavailable"), CLOSE];
    }
    case "storage.delete":
      return [
        { answer: { kind: "ok" }, text: "ok", apply: (world) => ({ ...world, stored: undefined }) },
        fail("storage unavailable"),
        CLOSE,
      ];
    case "signer.writeContract": {
      const rejected = fail("User rejected the request.", "throws (user rejects)");
      if (call.functionName === "unwrap") {
        return [send(slot, "unwrap", requestOf(slot)), rejected, CLOSE];
      }
      if (call.functionName === "finalizeUnwrap" && call.requestId) {
        const open = isOpen(call.requestId);
        // When the request is gone, the wallet's gas estimate hits the revert.
        // A wallet that skips the estimate sends the transaction anyway, and
        // it reverts when mined.
        const invalid: Option = {
          ...fail(
            'The contract reverted with custom error "InvalidUnwrapRequest".',
            "throws InvalidUnwrapRequest (wallet gas estimate)",
          ),
          when: (world) => !open(world),
        };
        return [invalid, send(slot, "finalize", call.requestId), rejected, CLOSE];
      }
      throw new HarnessError(`unexpected write ${call.functionName}`);
    }
    case "provider.waitForTransactionReceipt": {
      const timeout = fail(
        "timed out while waiting for transaction receipt",
        "throws (RPC timeout)",
      );
      const mined = (value: ReceiptAnswer): Option => ({
        answer: { kind: "ok", value },
        text: `-> ${value.status}`,
        when: txStatus(call.hash, value.status),
      });
      const unwrapSlot = /^0x0+a(\d+)$/.exec(call.hash)?.[1];
      const receipts =
        unwrapSlot === undefined
          ? [mined({ status: "success" }), mined({ status: "reverted" })]
          : [mined({ status: "success", unwrapRequestId: requestOf(Number(unwrapSlot)) })];
      return [...receipts, timeout, CLOSE];
    }
    case "provider.readContract": {
      const open = isOpen(call.requestId);
      return [
        { answer: { kind: "ok", value: USER }, text: "-> requester (open)", when: open },
        {
          answer: { kind: "ok", value: ZERO_ADDRESS },
          text: "-> zero address (gone)",
          when: (world) => !open(world),
        },
        fail("RPC request failed", "throws (RPC error)"),
        CLOSE,
      ];
    }
    case "relayer.decryptPublicValuesWithSignatures":
      return [{ answer: { kind: "ok" }, text: "ok" }, fail("relayer unavailable"), CLOSE];
  }
  throw new HarnessError(`unknown call ${JSON.stringify(call)}`);
}

export interface ChainStep {
  text: string;
  apply: (world: World) => World;
}

function setStatus(world: World, hash: Hex, status: TxStatus): World {
  return { ...world, txs: world.txs.map((tx) => (tx.hash === hash ? { ...tx, status } : tx)) };
}

/**
 * The chain mines the account's next pending transaction (nonce order), like
 * ERC7984ERC20WrapperUpgradeable would run it.
 */
export function chainSteps(world: World): ChainStep[] {
  const tx = world.txs.find((t) => t.status === "pending");
  if (!tx) {
    return [];
  }
  if (tx.kind === "unwrap") {
    return [
      {
        text: pretty(`chain: mines ${tx.hash} -> ${tx.requestId} open`),
        apply: (w) => setStatus(w, tx.hash, "success"),
      },
    ];
  }
  if (requestStatus(world, tx.requestId) === "open") {
    return [
      {
        text: pretty(`chain: mines ${tx.hash} -> ${tx.requestId} finalized, ERC-20 paid out`),
        apply: (w) => setStatus(w, tx.hash, "success"),
      },
      {
        text: pretty(
          `chain: mines ${tx.hash} -> reverts for another reason, ${tx.requestId} stays open`,
        ),
        apply: (w) => setStatus(w, tx.hash, "reverted"),
      },
    ];
  }
  return [
    {
      text: pretty(`chain: mines ${tx.hash} -> reverts with InvalidUnwrapRequest`),
      apply: (w) => setStatus(w, tx.hash, "reverted"),
    },
  ];
}
