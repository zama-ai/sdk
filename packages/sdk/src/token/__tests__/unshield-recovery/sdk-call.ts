// Runs one SDK call of the real WrappedToken against scripted answers.
//
// Every awaited call of a `Call` kind goes through `yieldPoint`. The first
// `script.length` calls get the scripted answers. The next call stays pending
// forever, and the run returns it. The harness assumes one call in flight at
// a time per SDK call: two at once is a HarnessError.
import type { Address, Hex } from "viem";
import { UnshieldAlreadyFinalizedError } from "../../../errors";
import { Topics } from "../../../events";
import { createMockChain } from "../../../test-fixtures/chain";
import { USER, WRAPPER } from "../../../test-fixtures/constants";
import { createMockProvider } from "../../../test-fixtures/provider";
import { createMockRelayer } from "../../../test-fixtures/relayer";
import { buildSDK } from "../../../test-fixtures/sdk";
import { createMockSigner } from "../../../test-fixtures/signer";
import type { RelayerSDK } from "../../../relayer/types";
import type {
  GenericProvider,
  GenericSigner,
  GenericStorage,
  TransactionReceipt,
} from "../../../types";
import { legacyPendingUnshieldKey, pendingUnshieldsKey } from "../../pending-unshield";
import { WrappedToken } from "../../wrapped-token";

/** The storage key of this wrapper's pending-unshield entries. */
export const STORAGE_KEY = pendingUnshieldsKey(WRAPPER);

/**
 * Mock methods answered at once with a fixed value, beyond the special cases in
 * `runSdkCall`. The explorer answers each `Call` kind in every possible way. A
 * HarnessError "unexpected call" means the SDK made a call that is in neither:
 * add a `Call` kind (its answers in world.ts `options`) or allow it here.
 */
const ALLOWED_CALLS = {
  signer: ["requireWalletAccount"],
  provider: ["getChainId"],
  relayer: ["encryptValues"],
} as const;

/** One awaited call that the explorer schedules. */
export type Call =
  | { kind: "storage.get"; key: string }
  | { kind: "storage.set"; key: string; value: string }
  | { kind: "storage.delete"; key: string }
  | { kind: "signer.writeContract"; functionName: string; requestId?: Hex }
  | { kind: "provider.waitForTransactionReceipt"; hash: Hex }
  | { kind: "provider.getTransactionReceipt"; hash: Hex }
  | { kind: "provider.readContract"; functionName: string; requestId: Hex }
  | { kind: "relayer.decryptPublicValuesWithSignatures"; encryptedValues: Hex[] };

export type CallKind = Call["kind"];
export type CallOf<K extends CallKind> = Extract<Call, { kind: K }>;

/** A mined receipt. `unwrapRequestId`: it carries this wrapper's UnwrapRequested event. */
export interface ReceiptAnswer {
  status: "success" | "reverted";
  unwrapRequestId?: Hex;
}

/** What a call returns, by call kind. */
export interface Returns {
  "storage.get": string | null;
  "storage.set": undefined;
  "storage.delete": undefined;
  "signer.writeContract": Hex;
  "provider.waitForTransactionReceipt": ReceiptAnswer;
  "provider.getTransactionReceipt": ReceiptAnswer | null;
  "provider.readContract": Address;
  "relayer.decryptPublicValuesWithSignatures": undefined;
}

/** How a call settles: it returns, it throws, or the tab closes and it never returns. */
export type Answer<K extends CallKind = CallKind> =
  | { kind: "ok"; value: Returns[K] }
  | { kind: "throw"; message: string }
  | { kind: "close" };

/** A call and its answer. `kind` repeats `call.kind`, so a switch on it narrows both. */
export type Step = {
  [K in CallKind]: { kind: K; call: CallOf<K>; answer: Answer<K> };
}[CallKind];

/** The SDK call an actor makes. `getPendingUnshield` goes on to `resumeUnshield` when it returns a hash. */
export type Entry =
  | { kind: "unshield" }
  | { kind: "unshieldAll" }
  | { kind: "getPendingUnshield" }
  | { kind: "resumeUnshield"; hash: Hex };

export type Outcome =
  | { kind: "returned"; value: string }
  | { kind: "threw"; name: string; message: string; unwrapRequestId?: Hex };

export interface RunResult {
  next: { kind: "call"; call: Call } | { kind: "done"; outcome: Outcome };
  /** The hash `getPendingUnshield` returned after the last scripted answer; the app then resumes it. */
  reported?: Hex;
}

/** The harness, not the SDK, misbehaved. Fix the fake before trusting any result. */
export class HarnessError extends Error {
  override name = "HarnessError";
}

const NONZERO_HANDLE = `0x${"ab".repeat(32)}` as Hex;
const STUCK_MS = 5000;

// Built once: vitest keeps every vi.fn it creates, and the explorer makes
// thousands of runs. The methods a run keeps from these give fixed answers.
const SIGNER = createMockSigner(USER);
const PROVIDER = createMockProvider();
const RELAYER = createMockRelayer();

function never<T>(): Promise<T> {
  return new Promise<T>(() => {});
}

function macrotask(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/**
 * The fixture mock with every method that is neither explored nor allowed
 * replaced by one that reports a HarnessError. A dependency call the SDK
 * starts making later then fails the run instead of silently answering at once.
 */
function strict<T extends object>(
  name: keyof typeof ALLOWED_CALLS,
  mock: T,
  overrides: Partial<T>,
  problems: string[],
): T {
  const allowed: readonly string[] = ALLOWED_CALLS[name];
  const out: T = { ...mock, ...overrides };
  for (const key of Object.keys(mock) as (keyof T)[]) {
    if (key in overrides || allowed.includes(String(key)) || typeof mock[key] !== "function") {
      continue;
    }
    out[key] = (() => {
      problems.push(`unexpected call ${name}.${String(key)}: see ALLOWED_CALLS`);
      return never();
    }) as T[keyof T];
  }
  return out;
}

function toReceipt(answer: ReceiptAnswer): TransactionReceipt {
  const logs = answer.unwrapRequestId
    ? [
        {
          address: WRAPPER,
          topics: [
            Topics.UnwrapRequested,
            `0x${USER.slice(2).toLowerCase().padStart(64, "0")}`,
            answer.unwrapRequestId,
          ] as Hex[],
          data: NONZERO_HANDLE,
        },
      ]
    : [];
  return { status: answer.status, logs };
}

async function start(
  entry: Entry,
  token: WrappedToken,
  report: (hash: Hex) => void,
): Promise<unknown> {
  switch (entry.kind) {
    case "unshield":
      return token.unshield(50n, { skipBalanceCheck: true });
    case "unshieldAll":
      return token.unshieldAll();
    case "resumeUnshield":
      return token.resumeUnshield(entry.hash);
    case "getPendingUnshield": {
      const hash = await token.getPendingUnshield();
      if (hash === null) {
        return null;
      }
      report(hash);
      return token.resumeUnshield(hash);
    }
  }
  throw new HarnessError(`unknown entry ${JSON.stringify(entry)}`);
}

function describeOutcome(value: unknown): Outcome {
  if (value === null) {
    return { kind: "returned", value: "null" };
  }
  const txHash = (value as { txHash?: string } | undefined)?.txHash;
  return { kind: "returned", value: txHash ?? typeof value };
}

function describeError(error: unknown): Outcome {
  if (error instanceof UnshieldAlreadyFinalizedError) {
    return {
      kind: "threw",
      name: error.name,
      message: error.message,
      unwrapRequestId: error.unwrapRequestId,
    };
  }
  if (error instanceof Error) {
    return { kind: "threw", name: error.name, message: error.message };
  }
  return { kind: "threw", name: typeof error, message: String(error) };
}

/**
 * Builds a fresh SDK (one browser tab), runs `entry` with the scripted
 * answers, and reports the next pending call or how the SDK call ended.
 */
export async function runSdkCall(
  entry: Entry,
  script: readonly Step[],
  { receiptLookup = true }: { receiptLookup?: boolean } = {},
): Promise<RunResult> {
  const calls: Call[] = [];
  let reported: { at: number; hash: Hex } | undefined;
  const problems: string[] = [];
  let started = false;
  let reachFrontier: (call: Call) => void = () => {};
  const frontier = new Promise<Call>((resolve) => {
    reachFrontier = resolve;
  });

  function yieldPoint<K extends CallKind>(call: CallOf<K>): Promise<Returns[K]> {
    if (!started) {
      problems.push(`${call.kind} ran while the SDK was built, before the call under test`);
      return never();
    }
    const index = calls.length;
    calls.push(call);
    if (index === script.length) {
      reachFrontier(call);
      return never();
    }
    const step = script[index];
    if (!step) {
      problems.push(`${call.kind} was called while another call was still pending`);
      return never();
    }
    if (JSON.stringify(step.call) !== JSON.stringify(call)) {
      problems.push(
        `replay made a different call (not deterministic): expected ${JSON.stringify(step.call)}, got ${JSON.stringify(call)}`,
      );
      return never();
    }
    // Same call, so the same kind: the answer has K's return type.
    const answer = step.answer as Answer<K>;
    if (answer.kind === "ok") {
      return Promise.resolve(answer.value);
    }
    if (answer.kind === "throw") {
      return Promise.reject(new Error(answer.message));
    }
    problems.push("a call answered with close was replayed");
    return never();
  }

  function checkKey(key: string): string {
    if (key !== STORAGE_KEY) {
      problems.push(`unexpected storage key ${key}: see ALLOWED_CALLS`);
    }
    return key;
  }

  const signer = strict(
    "signer",
    SIGNER,
    {
      writeContract: ((config: { functionName: string; args?: readonly unknown[] }) =>
        yieldPoint<"signer.writeContract">({
          kind: "signer.writeContract",
          functionName: config.functionName,
          ...(config.functionName === "finalizeUnwrap" && { requestId: config.args?.[0] as Hex }),
        })) as GenericSigner["writeContract"],
    },
    problems,
  );
  const provider = strict(
    "provider",
    PROVIDER,
    {
      waitForTransactionReceipt: async (hash) =>
        toReceipt(
          await yieldPoint<"provider.waitForTransactionReceipt">({
            kind: "provider.waitForTransactionReceipt",
            hash,
          }),
        ),
      // Without it, the SDK falls back to a wait raced against a 5 s timer. A
      // wait that throws gives the same result as the timer, so the timer is
      // not explored; a run that ends on the wait leaves it pending, harmlessly.
      ...(receiptLookup && {
        getTransactionReceipt: async (hash: Hex) => {
          const answer = await yieldPoint<"provider.getTransactionReceipt">({
            kind: "provider.getTransactionReceipt",
            hash,
          });
          return answer && toReceipt(answer);
        },
      }),
      readContract: ((config: { functionName: string; args?: readonly unknown[] }) => {
        // Balances are not modeled: unwrapAll only needs a non-zero encrypted balance.
        if (config.functionName === "confidentialBalanceOf") {
          return Promise.resolve(NONZERO_HANDLE);
        }
        if (config.functionName !== "unwrapRequester") {
          problems.push(`unexpected chain read ${config.functionName}: see ALLOWED_CALLS`);
          return never();
        }
        return yieldPoint<"provider.readContract">({
          kind: "provider.readContract",
          functionName: config.functionName,
          requestId: config.args?.[0] as Hex,
        });
      }) as GenericProvider["readContract"],
    },
    problems,
  );
  const storage: GenericStorage = {
    get: async <T>(key: string) => {
      // The key SDK 3.8 and older wrote. No older SDK runs in the model, so it stays empty.
      if (key === legacyPendingUnshieldKey(WRAPPER)) {
        return null;
      }
      const value = await yieldPoint<"storage.get">({ kind: "storage.get", key: checkKey(key) });
      return value === null ? null : (JSON.parse(value) as T);
    },
    set: (key, value) =>
      yieldPoint<"storage.set">({
        kind: "storage.set",
        key: checkKey(key),
        value: JSON.stringify(value),
      }),
    delete: (key) => yieldPoint<"storage.delete">({ kind: "storage.delete", key: checkKey(key) }),
  };
  const relayer = strict(
    "relayer",
    RELAYER,
    {
      decryptPublicValuesWithSignatures: (async (params: { encryptedValues: readonly Hex[] }) => {
        await yieldPoint<"relayer.decryptPublicValuesWithSignatures">({
          kind: "relayer.decryptPublicValuesWithSignatures",
          encryptedValues: [...params.encryptedValues],
        });
        return {
          clearValues: params.encryptedValues.map(() => ({ type: "uint64" as const, value: 50n })),
          checkSignaturesArgs: {
            handlesList: [...params.encryptedValues],
            abiEncodedCleartexts: "0x32" as Hex,
            decryptionProof: "0x00" as Hex,
          },
        };
      }) as unknown as RelayerSDK["decryptPublicValuesWithSignatures"],
    },
    problems,
  );
  const chain = createMockChain({ id: 31337 });
  const token = new WrappedToken(buildSDK(chain, relayer, provider, signer, storage), WRAPPER);
  await macrotask();
  started = true;

  let outcome: Outcome | undefined;
  const settled = start(entry, token, (hash) => {
    reported = { at: calls.length, hash };
  }).then(
    (value) => {
      outcome = describeOutcome(value);
    },
    (error: unknown) => {
      outcome = describeError(error);
    },
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stuck = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, STUCK_MS);
  });
  await Promise.race([frontier, settled, stuck]);
  clearTimeout(timer);
  await macrotask();

  const pending = calls[script.length];
  if (outcome === undefined && pending === undefined) {
    problems.push("the SDK call is stuck on an await that the harness does not control");
  } else if (outcome !== undefined && pending !== undefined) {
    problems.push(`the SDK call ended without awaiting ${pending.kind}`);
  } else if (outcome !== undefined && calls.length < script.length) {
    problems.push("the SDK call ended before the script did");
  }
  const next: RunResult["next"] | undefined = outcome
    ? { kind: "done", outcome }
    : pending && { kind: "call", call: pending };
  if (problems.length > 0 || !next) {
    throw new HarnessError(
      `${problems.join("; ")}\n  entry: ${JSON.stringify(entry)}\n  script: ${JSON.stringify(script)}`,
    );
  }
  return reported?.at === script.length ? { next, reported: reported.hash } : { next };
}
