import { Effect } from "effect";
import type { Address } from "../relayer/relayer-sdk.types";
import type { StoredCredentials } from "../token/token.types";
import { Relayer } from "../services/Relayer";
import { Signer } from "../services/Signer";
import { CredentialStorage, SessionStorage } from "../services/Storage";
import { EventEmitter } from "../services/EventEmitter";
import { SigningRejected, SigningFailed } from "../errors";
import { ZamaSDKEvents } from "../events/sdk-events";
import { encrypt, computeStoreKey } from "./crypto";
import type { EncryptedCredentials, SessionEntry } from "./types";

/**
 * Generate a fresh FHE keypair, create an EIP-712 authorization, and
 * prompt the user to sign it. Persists the encrypted credentials to storage.
 */
export const create = (
  contractAddresses: Address[],
  keypairTTL: number,
  sessionTTL: number,
): Effect.Effect<
  StoredCredentials,
  SigningRejected | SigningFailed,
  Relayer | Signer | CredentialStorage | SessionStorage | EventEmitter
> =>
  Effect.gen(function* () {
    const relayer = yield* Relayer;
    const signer = yield* Signer;
    const credentialStorage = yield* CredentialStorage;
    const sessionStorage = yield* SessionStorage;
    const emitter = yield* EventEmitter;

    yield* emitter.emit({ type: ZamaSDKEvents.CredentialsCreating, contractAddresses });

    const address = (yield* signer.getAddress()).toLowerCase();
    const chainId = yield* signer.getChainId();
    const storeKey = yield* Effect.promise(() => computeStoreKey(address, chainId));

    const keypair = yield* relayer
      .generateKeypair()
      .pipe(
        Effect.mapError(
          (e) => new SigningFailed({ message: "Failed to generate keypair", cause: e.cause }),
        ),
      );
    const startTimestamp = Math.floor(Date.now() / 1000);
    const durationDays = Math.ceil(keypairTTL / 86400);

    const eip712 = yield* relayer
      .createEIP712(keypair.publicKey, contractAddresses, startTimestamp, durationDays)
      .pipe(
        Effect.mapError(
          (e) => new SigningFailed({ message: "Failed to create EIP712", cause: e.cause }),
        ),
      );

    // Sign — the Signer layer already maps rejection/failure to tagged errors
    const signature = yield* signer.signTypedData(eip712);

    // Save session entry
    const sessionEntry: SessionEntry = {
      signature,
      createdAt: Math.floor(Date.now() / 1000),
      ttl: sessionTTL,
    };
    yield* sessionStorage.set(storeKey, sessionEntry);

    const creds: StoredCredentials = {
      publicKey: keypair.publicKey,
      privateKey: keypair.privateKey,
      signature,
      contractAddresses,
      startTimestamp,
      durationDays,
    };

    // Best-effort persist encrypted credentials
    yield* Effect.gen(function* () {
      const encryptedPrivateKey = yield* Effect.promise(() =>
        encrypt(creds.privateKey, creds.signature, address),
      );
      const { privateKey: _, signature: _sig, ...rest } = creds;
      const encrypted: EncryptedCredentials = { ...rest, encryptedPrivateKey };
      yield* credentialStorage.set(storeKey, encrypted);
    }).pipe(Effect.catchAll(() => Effect.void));

    yield* emitter.emit({ type: ZamaSDKEvents.CredentialsCreated, contractAddresses });

    return creds;
  });
