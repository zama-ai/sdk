// Runs one SDK call of the real WrappedToken against scripted answers.
//
// Every awaited call that reads or writes the storage or the chain, or asks
// the relayer for a public decryption, goes through `yieldPoint`. The first
// `script.length` calls get the scripted answers. The next call stays pending
// forever, and the run returns it.
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
import { loadPendingUnshieldRequests } from "../../pending-unshield";
import { WrappedToken } from "../../wrapped-token";

/** One awaited call that the explorer schedules. */
export type Call =
  | { kind: "storage.get"; key: string }
  | { kind: "storage.set"; key: string; value: string }
  | { kind: "storage.delete"; key: string }
  | { kind: "signer.writeContract"; functionName: string; requestId?: Hex }
  | { kind: "provider.waitForTransactionReceipt"; hash: Hex }
  | { kind: "provider.readContract"; functionName: string; requestId: Hex }
  | { kind: "relayer.decryptPublicValuesWithSignatures"; encryptedValues: Hex[] };

export interface ReceiptAnswer {
  status: "success" | "reverted";
  unwrapRequestId?: Hex;
}

/** How a call settles: it returns, it throws, or the tab closes and it never returns. */
export type Answer =
  | { kind: "ok"; value?: string | null | ReceiptAnswer }
  | { kind: "throw"; message: string }
  | { kind: "close" };

export interface Step {
  call: Call;
  answer: Answer;
}

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

/** The storage key the SDK uses for this wrapper's pending-unshield entries. */
export const STORAGE_KEY = await (async () => {
  let key: string | undefined;
  const recorder: GenericStorage = {
    get: (k) => {
      key = k;
      return Promise.resolve(null);
    },
    set: () => Promise.resolve(),
    delete: () => Promise.resolve(),
  };
  await loadPendingUnshieldRequests(recorder, WRAPPER);
  if (key === undefined) {
    throw new HarnessError("loadPendingUnshieldRequests did not read a key");
  }
  return key;
})();

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
  name: string,
  mock: T,
  overrides: Partial<T>,
  instant: readonly (keyof T)[],
  problems: string[],
): T {
  const out: T = { ...mock, ...overrides };
  for (const key of Object.keys(mock) as (keyof T)[]) {
    if (key in overrides || instant.includes(key) || typeof mock[key] !== "function") {
      continue;
    }
    out[key] = (() => {
      problems.push(`unexpected call ${name}.${String(key)}: explore it as a Call or allow it`);
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
export async function runSdkCall(entry: Entry, script: readonly Step[]): Promise<RunResult> {
  const calls: Call[] = [];
  let reported: { at: number; hash: Hex } | undefined;
  const problems: string[] = [];
  let started = false;
  let reachFrontier: (call: Call) => void = () => {};
  const frontier = new Promise<Call>((resolve) => {
    reachFrontier = resolve;
  });

  function yieldPoint<T>(call: Call, toValue: (value: Answer & { kind: "ok" }) => T): Promise<T> {
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
    const { answer } = step;
    if (answer.kind === "ok") {
      return Promise.resolve(toValue(answer));
    }
    if (answer.kind === "throw") {
      return Promise.reject(new Error(answer.message));
    }
    problems.push("a call answered with close was replayed");
    return never();
  }

  function checkKey(key: string): string {
    if (key !== STORAGE_KEY) {
      problems.push(
        `unexpected storage key ${key}: only the pending-unshield entries are explored`,
      );
    }
    return key;
  }

  const signer = strict(
    "signer",
    SIGNER,
    {
      writeContract: ((config: { functionName: string; args?: readonly unknown[] }) =>
        yieldPoint(
          {
            kind: "signer.writeContract",
            functionName: config.functionName,
            ...(config.functionName === "finalizeUnwrap" && { requestId: config.args?.[0] as Hex }),
          },
          (answer) => answer.value as Hex,
        )) as GenericSigner["writeContract"],
    },
    ["requireWalletAccount"],
    problems,
  );
  const provider = strict(
    "provider",
    PROVIDER,
    {
      waitForTransactionReceipt: (hash) =>
        yieldPoint({ kind: "provider.waitForTransactionReceipt", hash }, (answer) =>
          toReceipt(answer.value as ReceiptAnswer),
        ),
      readContract: ((config: { functionName: string; args?: readonly unknown[] }) => {
        // Balances are not modeled: unwrapAll only needs a non-zero encrypted balance.
        if (config.functionName === "confidentialBalanceOf") {
          return Promise.resolve(NONZERO_HANDLE);
        }
        if (config.functionName !== "unwrapRequester") {
          problems.push(`unexpected chain read ${config.functionName}`);
          return never();
        }
        return yieldPoint(
          {
            kind: "provider.readContract",
            functionName: config.functionName,
            requestId: config.args?.[0] as Hex,
          },
          (answer) => answer.value as Address,
        );
      }) as GenericProvider["readContract"],
    },
    ["getChainId"],
    problems,
  );
  const storage: GenericStorage = {
    get: <T>(key: string) =>
      yieldPoint({ kind: "storage.get", key: checkKey(key) }, (answer) =>
        typeof answer.value === "string" ? (JSON.parse(answer.value) as T) : null,
      ),
    set: (key, value) =>
      yieldPoint(
        { kind: "storage.set", key: checkKey(key), value: JSON.stringify(value) },
        () => undefined,
      ),
    delete: (key) => yieldPoint({ kind: "storage.delete", key: checkKey(key) }, () => undefined),
  };
  const relayer = strict(
    "relayer",
    RELAYER,
    {
      decryptPublicValuesWithSignatures: ((params: { encryptedValues: readonly Hex[] }) =>
        yieldPoint(
          {
            kind: "relayer.decryptPublicValuesWithSignatures",
            encryptedValues: [...params.encryptedValues],
          },
          () => ({
            clearValues: params.encryptedValues.map(() => ({
              type: "uint64" as const,
              value: 50n,
            })),
            checkSignaturesArgs: {
              handlesList: [...params.encryptedValues],
              abiEncodedCleartexts: "0x32" as Hex,
              decryptionProof: "0x00" as Hex,
            },
          }),
        )) as unknown as RelayerSDK["decryptPublicValuesWithSignatures"],
    },
    ["encryptValues"],
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
  } else if (calls.length > script.length + 1) {
    problems.push("more than one call is pending at once");
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
