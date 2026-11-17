// The shared world that the SDK calls race on: one storage and one wrapper on
// one chain. This file is the fake. For each pending call it lists every
// answer the real wallet, RPC, storage or relayer could give, the world state
// in which each answer is possible, and what it changes. If a result looks wrong, check this
// file against ERC7984ERC20WrapperUpgradeable and the GenericProvider /
// GenericSigner / GenericStorage contracts first: a fake that answers
// something the real one cannot is a harness error, not a finding.
import {
  HarnessError,
  USER,
  type Answer,
  type Call,
  type Hex,
  type ReceiptAnswer,
} from "./sdk-call";

const POINTER_PREFIX = "zama:pending-unshield:";
const ZERO_ADDRESS = `0x${"0".repeat(40)}`;

export type TxStatus = "pending" | "success" | "reverted";

export interface Tx {
  readonly hash: Hex;
  readonly kind: "unwrap" | "finalize";
  readonly requestId: Hex;
  readonly status: TxStatus;
}

export interface World {
  /** Storage key -> JSON value. */
  readonly storage: ReadonlyMap<string, string>;
  /** Every transaction a wallet sent, in send order. */
  readonly txs: readonly Tx[];
  /** History for PointerKeptAfterSave: requests whose pointer `storage.set` wrote. */
  readonly saved: readonly Hex[];
}

export const EMPTY_WORLD: World = { storage: new Map(), txs: [], saved: [] };

// Actor k sends at most one unwrap (Uk) and one finalizeUnwrap (Fk); Uk opens request reqk.
const word = (tail: string): Hex => `0x${tail.padStart(64, "0")}`;
export const unwrapTx = (slot: number): Hex => word(`a${slot}`);
export const finalizeTx = (slot: number): Hex => word(`f${slot}`);
export const requestOf = (slot: number): Hex => word(`e${slot}`);

/** The actor slot k when `hash` is Uk, else undefined. */
function unwrapSlotOf(hash: Hex): number | undefined {
  const match = /^0x0+a(\d+)$/.exec(hash);
  return match ? Number(match[1]) : undefined;
}

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

export interface Pointer {
  unwrapTxHash: Hex;
  unwrapRequestId: Hex;
}

export function parsePointer(json: string): Pointer {
  const value = JSON.parse(json) as Partial<Pointer>;
  if (!value.unwrapTxHash || !value.unwrapRequestId) {
    throw new HarnessError(`unexpected pending-unshield value ${json}`);
  }
  return { unwrapTxHash: value.unwrapTxHash, unwrapRequestId: value.unwrapRequestId };
}

/** The pending-unshield pointer, or null. One wrapper, so at most one key. */
export function pointer(world: World): Pointer | null {
  const keys = [...world.storage.keys()].filter((key) => key.startsWith(POINTER_PREFIX));
  if (keys.length > 1) {
    throw new HarnessError(`more than one pending-unshield key: ${keys.join(", ")}`);
  }
  const json = keys[0] === undefined ? undefined : world.storage.get(keys[0]);
  return json === undefined ? null : parsePointer(json);
}

export function isPointerKey(key: string): boolean {
  return key.startsWith(POINTER_PREFIX);
}

export function pointerLabel(json: string | null | undefined): string {
  return json ? pretty(`pointer(${parsePointer(json).unwrapTxHash})`) : "empty";
}

export function callLabel(call: Call): string {
  switch (call.kind) {
    case "storage.get":
    case "storage.delete":
      return `${call.kind}(pending-unshield)`;
    case "storage.set":
      return `storage.set(pending-unshield, ${pointerLabel(call.value)})`;
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

function withStorage(world: World, key: string, value: string | undefined): World {
  const storage = new Map(world.storage);
  if (value === undefined) {
    storage.delete(key);
  } else {
    storage.set(key, value);
  }
  return { ...world, storage };
}

const isOpen = (requestId: Hex) => (world: World) => requestStatus(world, requestId) === "open";
const txStatus = (hash: Hex, status: TxStatus) => (world: World) =>
  world.txs.some((tx) => tx.hash === hash && tx.status === status);

/**
 * Every answer the real dependency could give to `call` made by actor `slot`,
 * each with the world in which it is possible. `storedValues` lists every
 * value a `storage.get` can return: null and each value any actor stores.
 */
export function options(
  call: Call,
  slot: number,
  storedValues: readonly (string | null)[],
): Option[] {
  switch (call.kind) {
    case "storage.get":
      return [
        ...storedValues.map((value): Option => ({
          answer: { kind: "ok", value },
          text: `-> ${pointerLabel(value)}`,
          when: (world) => (world.storage.get(call.key) ?? null) === value,
        })),
        fail("storage unavailable"),
        CLOSE,
      ];
    case "storage.set": {
      const ok: Option = {
        answer: { kind: "ok" },
        text: "ok",
        apply: (world) => {
          const next = withStorage(world, call.key, call.value);
          if (!isPointerKey(call.key)) {
            return next;
          }
          const { unwrapRequestId } = parsePointer(call.value);
          const saved = [...new Set([...world.saved, unwrapRequestId])].sort();
          return { ...next, saved };
        },
      };
      return [ok, fail("storage unavailable"), CLOSE];
    }
    case "storage.delete":
      return [
        {
          answer: { kind: "ok" },
          text: "ok",
          apply: (world) => withStorage(world, call.key, undefined),
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
      const unwrapSlot = unwrapSlotOf(call.hash);
      const receipts =
        unwrapSlot === undefined
          ? [mined({ status: "success" }), mined({ status: "reverted" })]
          : [mined({ status: "success", unwrapRequestId: requestOf(unwrapSlot) })];
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

/** The chain mines one pending transaction, like ERC7984ERC20WrapperUpgradeable would run it. */
export function chainSteps(world: World): ChainStep[] {
  const steps: ChainStep[] = [];
  for (const tx of world.txs) {
    if (tx.status !== "pending") {
      continue;
    }
    if (tx.kind === "unwrap") {
      steps.push({
        text: pretty(`chain: mines ${tx.hash} -> ${tx.requestId} open`),
        apply: (w) => setStatus(w, tx.hash, "success"),
      });
    } else if (requestStatus(world, tx.requestId) === "open") {
      steps.push(
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
      );
    } else {
      steps.push({
        text: pretty(`chain: mines ${tx.hash} -> reverts with InvalidUnwrapRequest`),
        apply: (w) => setStatus(w, tx.hash, "reverted"),
      });
    }
  }
  return steps;
}
