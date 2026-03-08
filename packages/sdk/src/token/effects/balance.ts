import { Effect } from "effect";
import type { Address, Handle } from "../../relayer/relayer-sdk.types";
import { Relayer } from "../../services/Relayer";
import { Signer } from "../../services/Signer";
import { EventEmitter } from "../../services/EventEmitter";
import { allow as credentialsAllow } from "../../credentials";
import { DecryptionFailed, NoCiphertext, RelayerRequestFailed } from "../../errors";
import { normalizeHandle } from "../../utils";
import { ZamaSDKEvents } from "../../events/sdk-events";
import {
  confidentialBalanceOfContract,
  supportsInterfaceContract,
  ERC7984_INTERFACE_ID,
  ERC7984_WRAPPER_INTERFACE_ID,
  nameContract,
  symbolContract,
  decimalsContract,
  allowanceContract,
  underlyingContract,
  wrapperExistsContract,
  getWrapperContract,
} from "../../contracts";
import { loadCachedBalance, saveCachedBalance } from "../balance-cache";
import type { GenericStorage } from "../token.types";

/** 32-byte zero handle, used to detect uninitialized encrypted balances. */
export const ZERO_HANDLE =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

/** Check if a handle is a zero handle (uninitialized balance). */
export function isZeroHandle(handle: string): handle is typeof ZERO_HANDLE | "0x" {
  return handle === ZERO_HANDLE || handle === "0x";
}

/** Coerce an unknown caught value to an Error instance. */
function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Map a decrypt error to the appropriate tagged error based on status code.
 */
function wrapDecryptError(
  error: unknown,
  fallbackMessage: string,
): DecryptionFailed | NoCiphertext | RelayerRequestFailed {
  if (error instanceof NoCiphertext || error instanceof RelayerRequestFailed) {
    return error;
  }

  const statusCode =
    error != null &&
    typeof error === "object" &&
    "statusCode" in error &&
    typeof (error as Record<string, unknown>).statusCode === "number"
      ? ((error as Record<string, unknown>).statusCode as number)
      : undefined;

  if (statusCode === 400) {
    return new NoCiphertext({
      message: error instanceof Error ? error.message : "No ciphertext for this account",
      cause: error instanceof Error ? error : undefined,
    });
  }

  if (statusCode !== undefined) {
    return new RelayerRequestFailed({
      message: error instanceof Error ? error.message : fallbackMessage,
      statusCode,
      cause: error instanceof Error ? error : undefined,
    });
  }

  return new DecryptionFailed({
    message: fallbackMessage,
    cause: error instanceof Error ? error : undefined,
  });
}

// ── Read operations ────────────────────────────────────────

/** Read the encrypted balance handle from the chain. */
export function readConfidentialBalanceOf(tokenAddress: Address, owner: Address) {
  return Effect.gen(function* () {
    const signer = yield* Signer;
    const raw = yield* signer.readContract<bigint>(
      confidentialBalanceOfContract(tokenAddress, owner),
    );
    return normalizeHandle(raw);
  });
}

/** Get the raw encrypted balance handle, resolving owner to signer if not provided. */
export function confidentialBalanceOf(tokenAddress: Address, owner?: Address) {
  return Effect.gen(function* () {
    const signer = yield* Signer;
    const ownerAddress = owner ?? (yield* signer.getAddress());
    return yield* readConfidentialBalanceOf(tokenAddress, ownerAddress);
  });
}

/**
 * Decrypt a single balance handle into a plaintext bigint.
 * Returns 0n for zero handles without calling the relayer.
 */
export function decryptBalance(
  tokenAddress: Address,
  handle: Handle,
  credentialsConfig: { keypairTTL: number; sessionTTL: number },
  storage: GenericStorage,
  owner?: Address,
) {
  return Effect.gen(function* () {
    if (isZeroHandle(handle)) return BigInt(0);

    const signer = yield* Signer;
    const relayer = yield* Relayer;
    const emitter = yield* EventEmitter;
    const signerAddress = owner ?? (yield* signer.getAddress());

    // Check persistent cache
    const cached = yield* Effect.promise(() =>
      loadCachedBalance({ storage, tokenAddress, owner: signerAddress, handle }),
    );
    if (cached !== null) return cached;

    const creds = yield* credentialsAllow([tokenAddress], credentialsConfig);

    const t0 = Date.now();
    yield* emitter.emit({ type: ZamaSDKEvents.DecryptStart });

    const result = yield* relayer
      .userDecrypt({
        handles: [handle],
        contractAddress: tokenAddress,
        signedContractAddresses: creds.contractAddresses,
        privateKey: creds.privateKey,
        publicKey: creds.publicKey,
        signature: creds.signature,
        signerAddress,
        startTimestamp: creds.startTimestamp,
        durationDays: creds.durationDays,
      })
      .pipe(
        Effect.tap(() =>
          emitter.emit({ type: ZamaSDKEvents.DecryptEnd, durationMs: Date.now() - t0 }),
        ),
        Effect.tapError((e) =>
          emitter.emit({
            type: ZamaSDKEvents.DecryptError,
            error: toError(e),
            durationMs: Date.now() - t0,
          }),
        ),
        Effect.mapError((e) => wrapDecryptError(e, "Failed to decrypt balance")),
      );

    const value = (result[handle] as bigint | undefined) ?? BigInt(0);
    yield* Effect.promise(() =>
      saveCachedBalance({ storage, tokenAddress, owner: signerAddress, handle, value }),
    );
    return value;
  });
}

/**
 * Decrypt the balance for a token address: reads the handle, then decrypts.
 * Returns 0n for zero balances.
 */
export function balanceOf(
  tokenAddress: Address,
  credentialsConfig: { keypairTTL: number; sessionTTL: number },
  storage: GenericStorage,
  owner?: Address,
) {
  return Effect.gen(function* () {
    const signer = yield* Signer;
    const ownerAddress = owner ?? (yield* signer.getAddress());
    const handle = yield* readConfidentialBalanceOf(tokenAddress, ownerAddress);

    if (isZeroHandle(handle)) return BigInt(0);

    // Check persistent cache
    const cached = yield* Effect.promise(() =>
      loadCachedBalance({ storage, tokenAddress, owner: ownerAddress, handle }),
    );
    if (cached !== null) return cached;

    const creds = yield* credentialsAllow([tokenAddress], credentialsConfig);

    const relayer = yield* Relayer;
    const emitter = yield* EventEmitter;

    const t0 = Date.now();
    yield* emitter.emit({ type: ZamaSDKEvents.DecryptStart });

    const result = yield* relayer
      .userDecrypt({
        handles: [handle],
        contractAddress: tokenAddress,
        signedContractAddresses: creds.contractAddresses,
        privateKey: creds.privateKey,
        publicKey: creds.publicKey,
        signature: creds.signature,
        signerAddress: ownerAddress,
        startTimestamp: creds.startTimestamp,
        durationDays: creds.durationDays,
      })
      .pipe(
        Effect.tap(() =>
          emitter.emit({ type: ZamaSDKEvents.DecryptEnd, durationMs: Date.now() - t0 }),
        ),
        Effect.tapError((e) =>
          emitter.emit({
            type: ZamaSDKEvents.DecryptError,
            error: toError(e),
            durationMs: Date.now() - t0,
          }),
        ),
        Effect.mapError((e) => wrapDecryptError(e, "Failed to decrypt balance")),
      );

    const value = (result[handle] as bigint | undefined) ?? BigInt(0);
    yield* Effect.promise(() =>
      saveCachedBalance({ storage, tokenAddress, owner: ownerAddress, handle, value }),
    );
    return value;
  });
}

/**
 * Batch-decrypt arbitrary encrypted handles in a single relayer call.
 * Zero handles are returned as 0n without hitting the relayer.
 */
export function decryptHandles(
  tokenAddress: Address,
  handles: Handle[],
  credentialsConfig: { keypairTTL: number; sessionTTL: number },
  owner?: Address,
) {
  return Effect.gen(function* () {
    const results = new Map<Handle, bigint>();
    const nonZeroHandles: Handle[] = [];

    for (const handle of handles) {
      if (isZeroHandle(handle)) {
        results.set(handle, BigInt(0));
      } else {
        nonZeroHandles.push(handle);
      }
    }

    if (nonZeroHandles.length === 0) return results;

    const creds = yield* credentialsAllow([tokenAddress], credentialsConfig);
    const relayer = yield* Relayer;
    const signer = yield* Signer;
    const emitter = yield* EventEmitter;
    const signerAddress = owner ?? (yield* signer.getAddress());

    const t0 = Date.now();
    yield* emitter.emit({ type: ZamaSDKEvents.DecryptStart });

    const decrypted = yield* relayer
      .userDecrypt({
        handles: nonZeroHandles,
        contractAddress: tokenAddress,
        signedContractAddresses: creds.contractAddresses,
        privateKey: creds.privateKey,
        publicKey: creds.publicKey,
        signature: creds.signature,
        signerAddress,
        startTimestamp: creds.startTimestamp,
        durationDays: creds.durationDays,
      })
      .pipe(
        Effect.tap(() =>
          emitter.emit({ type: ZamaSDKEvents.DecryptEnd, durationMs: Date.now() - t0 }),
        ),
        Effect.tapError((e) =>
          emitter.emit({
            type: ZamaSDKEvents.DecryptError,
            error: toError(e),
            durationMs: Date.now() - t0,
          }),
        ),
        Effect.mapError((e) => wrapDecryptError(e, "Failed to decrypt handles")),
      );

    for (const handle of nonZeroHandles) {
      results.set(handle, (decrypted[handle] as bigint | undefined) ?? BigInt(0));
    }

    return results;
  });
}

// ── Metadata reads ─────────────────────────────────────────

/** Check if the contract implements the ERC-7984 confidential token interface. */
export function isConfidential(tokenAddress: Address) {
  return Effect.gen(function* () {
    const signer = yield* Signer;
    const result = yield* signer.readContract(
      supportsInterfaceContract(tokenAddress, ERC7984_INTERFACE_ID),
    );
    return result === true;
  });
}

/** Check if the contract implements the ERC-7984 wrapper interface. */
export function isWrapper(tokenAddress: Address) {
  return Effect.gen(function* () {
    const signer = yield* Signer;
    const result = yield* signer.readContract(
      supportsInterfaceContract(tokenAddress, ERC7984_WRAPPER_INTERFACE_ID),
    );
    return result === true;
  });
}

/** Read the token name from the contract. */
export function name(tokenAddress: Address) {
  return Effect.gen(function* () {
    const signer = yield* Signer;
    return yield* signer.readContract<string>(nameContract(tokenAddress));
  });
}

/** Read the token symbol from the contract. */
export function symbol(tokenAddress: Address) {
  return Effect.gen(function* () {
    const signer = yield* Signer;
    return yield* signer.readContract<string>(symbolContract(tokenAddress));
  });
}

/** Read the token decimals from the contract. */
export function decimals(tokenAddress: Address) {
  return Effect.gen(function* () {
    const signer = yield* Signer;
    return yield* signer.readContract<number>(decimalsContract(tokenAddress));
  });
}

/** Read the underlying ERC-20 address from this token's wrapper contract. */
export function underlyingToken(tokenAddress: Address) {
  return Effect.gen(function* () {
    const signer = yield* Signer;
    return yield* signer.readContract<Address>(underlyingContract(tokenAddress));
  });
}

/** Read the ERC-20 allowance of the underlying token for a given wrapper. */
export function allowance(wrapperAddress: Address, owner?: Address) {
  return Effect.gen(function* () {
    const signer = yield* Signer;
    const underlying = yield* signer.readContract<Address>(underlyingContract(wrapperAddress));
    const userAddress = owner ?? (yield* signer.getAddress());
    return yield* signer.readContract<bigint>(
      allowanceContract(underlying, userAddress, wrapperAddress),
    );
  });
}

/** Look up the wrapper contract for a token via the deployment coordinator. */
export function discoverWrapper(tokenAddress: Address, coordinatorAddress: Address) {
  return Effect.gen(function* () {
    const signer = yield* Signer;
    const exists = yield* signer.readContract(
      wrapperExistsContract(coordinatorAddress, tokenAddress),
    );
    if (!exists) return null;
    return yield* signer.readContract<Address>(
      getWrapperContract(coordinatorAddress, tokenAddress),
    );
  });
}
