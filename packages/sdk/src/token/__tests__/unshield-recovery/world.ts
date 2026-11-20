// The shared world that the SDK calls race on: one storage and one wrapper on
// one chain, used by one account. For each pending call it lists every answer
// the real wallet, RPC, storage or relayer could give, the world state in
// which each answer is possible, and what it changes. A fake that answers
// something the real one cannot is a harness error, not a finding.
import type { Address, Hex } from "viem";
import { USER } from "../../../test-fixtures/constants";
import { encodePendingUnshields } from "../../pending-unshield";
import {
  HarnessError,
  type Answer,
  type Call,
  type CallKind,
  type CallOf,
  type ReceiptAnswer,
} from "./sdk-call";

const ZERO_ADDRESS: Address = `0x${"0".repeat(40)}`;

/** "replaced": the wallet replaced or cancelled it, and the replacement mined without opening a request. */
type TxStatus = "pending" | "success" | "reverted" | "replaced";

interface Tx {
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
const finalizeTx = (slot: number): Hex => word(`f${slot}`);
const requestOf = (slot: number): Hex => word(`e${slot}`);

/** The slot k when `hash` is Uk. */
function unwrapSlot(hash: Hex): number | undefined {
  const match = /^0x0+a(\d+)$/.exec(hash);
  return match ? Number(match[1]) : undefined;
}
export const isUnwrapTx = (hash: Hex) => unwrapSlot(hash) !== undefined;

/** An earlier unshield (U0) is open on chain with its entry saved, and its tab is gone. */
export const INTERRUPTED_WORLD: World = {
  ...EMPTY_WORLD,
  stored: JSON.stringify(encodePendingUnshields([unwrapTx(0)])),
  txs: [{ hash: unwrapTx(0), kind: "unwrap", requestId: requestOf(0), status: "success" }],
  saved: [requestOf(0)],
};

/** An earlier unshield (U0) was finalized on chain, but its entry is still stored. */
export const STALE_ENTRY_WORLD: World = {
  ...INTERRUPTED_WORLD,
  txs: [
    ...INTERRUPTED_WORLD.txs,
    { hash: finalizeTx(0), kind: "finalize", requestId: requestOf(0), status: "success" },
  ],
};

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

/** The unwrap tx hashes that a stored value lists. */
export function storedHashes(json: string | null | undefined): Hex[] {
  if (json === null || json === undefined) {
    return [];
  }
  const expected = JSON.stringify(Object.keys(encodePendingUnshields([])));
  const value = JSON.parse(json) as ReturnType<typeof encodePendingUnshields>;
  if (JSON.stringify(Object.keys(value)) !== expected || !Array.isArray(value.unwrapTxHashes)) {
    throw new HarnessError(`unexpected pending-unshield value ${json}`);
  }
  return [...value.unwrapTxHashes];
}

/** The requests that `json` has an entry for. */
export function storedRequests(world: World, json: string | null | undefined): Hex[] {
  return storedHashes(json).map((hash) => {
    const requestId = requestOfTx(world, hash);
    if (!requestId) {
      throw new HarnessError(`entry ${hash} is not a sent unwrap tx`);
    }
    return requestId;
  });
}

function storedLabel(json: string | null | undefined): string {
  const entries = storedHashes(json);
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
    case "provider.getTransactionReceipt":
      return pretty(`${call.kind}(${call.hash})`);
    case "provider.readContract":
      return pretty(`provider.readContract(${call.functionName} ${call.requestId})`);
    case "relayer.decryptPublicValuesWithSignatures":
      return pretty(
        `relayer.decryptPublicValuesWithSignatures(${call.encryptedValues.join(", ")})`,
      );
  }
  throw new HarnessError(`unknown call ${JSON.stringify(call)}`);
}

interface Option<K extends CallKind = CallKind> {
  answer: Answer<K>;
  /** How the step reads in a path, after the call label. */
  text: string;
  /** The answer is possible only in a world where this holds. Absent: always possible. */
  when?: (world: World) => boolean;
  apply?: (world: World) => World;
}

const fail = (message: string, text = `throws (${message})`): Option<never> => ({
  answer: { kind: "throw", message },
  text,
});
const CLOSE: Option<never> = { answer: { kind: "close" }, text: "" };

function send(slot: number, kind: Tx["kind"], requestId: Hex): Option<"signer.writeContract"> {
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
export function options<K extends CallKind>(
  call: CallOf<K>,
  slot: number,
  world: World,
): Option<K>[];
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
      const ok: Option<"storage.set"> = {
        answer: { kind: "ok", value: undefined },
        text: "ok",
        apply: (world) => {
          const stored = storedRequests(world, call.value);
          // A request stored again leaves both bounds: a later loss has a new cause.
          return {
            ...world,
            stored: call.value,
            saved: [...new Set([...world.saved, ...stored])].sort(),
            lostUpdate: world.lostUpdate.filter((r) => !stored.includes(r)),
            unsaved: world.unsaved.filter((u) => !stored.includes(u.requestId)),
          };
        },
      };
      return [ok, fail("storage unavailable"), CLOSE];
    }
    case "storage.delete":
      return [
        {
          answer: { kind: "ok", value: undefined },
          text: "ok",
          apply: (world) => ({ ...world, stored: undefined }),
        },
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
        const invalid: Option<"signer.writeContract"> = {
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
    case "provider.waitForTransactionReceipt":
    case "provider.getTransactionReceipt": {
      const slot = unwrapSlot(call.hash);
      const mined = (
        status: TxStatus,
        value: ReceiptAnswer,
      ): Option<"provider.getTransactionReceipt"> => ({
        answer: { kind: "ok", value },
        text: value.unwrapRequestId
          ? `-> ${value.status}`
          : `-> ${value.status}, no UnwrapRequested`,
        when: txStatus(call.hash, status),
      });
      const receipts = [
        mined(
          "success",
          slot === undefined
            ? { status: "success" }
            : { status: "success", unwrapRequestId: requestOf(slot) },
        ),
        mined("reverted", { status: "reverted" }),
      ];
      if (call.kind === "provider.getTransactionReceipt") {
        // A lookup by hash: a replaced tx is never mined under this hash.
        const notMined: Option<"provider.getTransactionReceipt"> = {
          answer: { kind: "ok", value: null },
          text: "-> null (not mined)",
          when: (world) =>
            txStatus(call.hash, "pending")(world) || txStatus(call.hash, "replaced")(world),
        };
        return [...receipts, notMined, fail("RPC request failed", "throws (RPC error)"), CLOSE];
      }
      // A wait that follows replacements, like viem's, returns the replacement's receipt.
      const replaced = mined("replaced", { status: "success" });
      const timeout = fail(
        "timed out while waiting for transaction receipt",
        "throws (RPC timeout)",
      );
      return [...receipts, replaced, timeout, CLOSE];
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
      return [
        { answer: { kind: "ok", value: undefined }, text: "ok" },
        fail("relayer unavailable"),
        CLOSE,
      ];
  }
  throw new HarnessError(`unknown call ${JSON.stringify(call)}`);
}

interface ChainStep {
  text: string;
  apply: (world: World) => World;
}

function setStatus(world: World, hash: Hex, status: TxStatus): World {
  return { ...world, txs: world.txs.map((tx) => (tx.hash === hash ? { ...tx, status } : tx)) };
}

/**
 * The chain mines the account's next pending transaction (nonce order), like
 * ERC7984ERC20WrapperUpgradeable would run it. An unwrap can also revert (for
 * example on an HCU limit), or the wallet can replace it with a cancel.
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
      {
        text: pretty(`chain: mines ${tx.hash} -> reverts, no request opened`),
        apply: (w) => setStatus(w, tx.hash, "reverted"),
      },
      {
        text: pretty(`chain: the wallet replaces ${tx.hash} with a cancel, no request opened`),
        apply: (w) => setStatus(w, tx.hash, "replaced"),
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
