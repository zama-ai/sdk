// Runs one SDK call of the real WrappedToken against scripted answers.
//
// The signer, provider, storage and relayer below send every awaited call
// that reads or writes the storage or the chain, or asks the relayer for a
// public decryption, through `yieldPoint`. The first `script.length` calls get
// the scripted answers. The next call stays pending forever, and the run
// returns it. The explorer runs each distinct script once and caches the result.
import type { ZamaConfig } from "../../../../packages/sdk/src/config/types";
import { UnshieldAlreadyFinalizedError } from "../../../../packages/sdk/src/errors";
import { Topics } from "../../../../packages/sdk/src/events";
import { LoggerService } from "../../../../packages/sdk/src/services/logger-service";
import { createMockRouter } from "../../../../packages/sdk/src/test-fixtures";
import { createMockChain } from "../../../../packages/sdk/src/test-fixtures/chain";
import { USER, WRAPPER } from "../../../../packages/sdk/src/test-fixtures/constants";
import { createMockProvider } from "../../../../packages/sdk/src/test-fixtures/provider";
import { createMockRelayer } from "../../../../packages/sdk/src/test-fixtures/relayer";
import { createMockSigner } from "../../../../packages/sdk/src/test-fixtures/signer";
import { WrappedToken } from "../../../../packages/sdk/src/token/wrapped-token";
import type {
  GenericProvider,
  GenericSigner,
  GenericStorage,
  TransactionReceipt,
} from "../../../../packages/sdk/src/types";
import type { RelayerSDK } from "../../../../packages/sdk/src/relayer/types";
import { ZamaSDK } from "../../../../packages/sdk/src/zama-sdk";

// The repo root does not depend on viem, so these types are spelled out here.
export type Hex = `0x${string}`;

export { USER, WRAPPER };

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
  /** What the actor reported after the last scripted answer (e.g. the hash `getPendingUnshield` returned). */
  notes: string[];
}

/** The harness, not the SDK, misbehaved. Fix the fake before trusting any result. */
export class HarnessError extends Error {
  override name = "HarnessError";
}

const NONZERO_HANDLE = `0x${"ab".repeat(32)}` as Hex;
const STUCK_MS = 5000;

function never<T>(): Promise<T> {
  return new Promise<T>(() => {});
}

function macrotask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
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
  note: (text: string) => void,
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
      note(`getPendingUnshield() returns ${hash}, the app calls resumeUnshield(${hash})`);
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
 * Builds a fresh SDK, runs `entry` with the scripted answers, and reports the
 * next pending call or how the SDK call ended.
 */
export async function runSdkCall(entry: Entry, script: readonly Step[]): Promise<RunResult> {
  const calls: Call[] = [];
  const notes: { at: number; text: string }[] = [];
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

  const signer = createMockSigner(USER, {
    writeContract: ((config: { functionName: string; args?: readonly unknown[] }) =>
      yieldPoint(
        {
          kind: "signer.writeContract",
          functionName: config.functionName,
          ...(config.functionName === "finalizeUnwrap" && { requestId: config.args?.[0] as Hex }),
        },
        (answer) => answer.value as Hex,
      )) as GenericSigner["writeContract"],
  });
  const provider = createMockProvider({
    waitForTransactionReceipt: (hash: Hex) =>
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
        (answer) => answer.value,
      );
    }) as GenericProvider["readContract"],
  });
  const storage: GenericStorage = {
    get: <T>(key: string) =>
      yieldPoint({ kind: "storage.get", key }, (answer) =>
        typeof answer.value === "string" ? (JSON.parse(answer.value) as T) : null,
      ),
    set: (key, value) =>
      yieldPoint({ kind: "storage.set", key, value: JSON.stringify(value) }, () => undefined),
    delete: (key) => yieldPoint({ kind: "storage.delete", key }, () => undefined),
  };
  const relayer = createMockRelayer({
    decryptPublicValuesWithSignatures: ((params: { encryptedValues: readonly Hex[] }) =>
      yieldPoint(
        {
          kind: "relayer.decryptPublicValuesWithSignatures",
          encryptedValues: [...params.encryptedValues],
        },
        () => ({
          clearValues: params.encryptedValues.map(() => ({ type: "uint64" as const, value: 50n })),
          checkSignaturesArgs: {
            handlesList: [...params.encryptedValues],
            abiEncodedCleartexts: "0x32" as Hex,
            decryptionProof: "0x00" as Hex,
          },
        }),
      )) as unknown as RelayerSDK["decryptPublicValuesWithSignatures"],
  });
  const chain = createMockChain({ id: 31337 });
  const config = {
    chains: [chain],
    router: createMockRouter({ relayer, chains: [chain] }),
    provider,
    signer,
    storage,
    permitStorage: storage,
    transportKeyPairTTL: 2592000,
    permitTTL: 1,
    clearCredentialsOnWalletChange: false,
    registryTTL: 86400,
    logger: new LoggerService(),
  } as unknown as ZamaConfig;
  const token = new WrappedToken(new ZamaSDK(config), WRAPPER);
  await macrotask();
  started = true;

  let outcome: Outcome | undefined;
  const settled = start(entry, token, (text) => notes.push({ at: calls.length, text })).then(
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
  return { next, notes: notes.filter((n) => n.at === script.length).map((n) => n.text) };
}
