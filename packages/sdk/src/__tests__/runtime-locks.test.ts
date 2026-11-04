import { createPublicClient, createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { aclAbi } from "../abi/acl.abi";
import { confidentialWrapperAbi } from "../abi/confidential-wrapper.abi";
import { erc1363Abi } from "../abi/erc1363.abi";
import { erc165Abi } from "../abi/erc165.abi";
import { hardhat } from "../chains";
import { ChainRouter } from "../chains/router";
import { wrappersRegistryAbi } from "../contracts/wrappers-registry";
import { CredentialService } from "../credentials/credential-service";
import { TransportKeyPairVault } from "../credentials/keypair-vault";
import { DerivationSecretHolder } from "../credentials/keypair-wrapping";
import { PermissionStore } from "../credentials/permission-store";
import { EthersProvider } from "../ethers/ethers-provider";
import { EthersSigner } from "../ethers/ethers-signer";
import { Decryption, Delegations, Offline, Permits } from "../namespaces";
import { FhevmRelayer } from "../relayer/fhevm-relayer";
import { CachingService } from "../services/caching-service";
import { DecryptionService } from "../services/decryption-service";
import { DelegationService } from "../services/delegation-service";
import { EncryptionService } from "../services/encryption-service";
import { LifecycleService } from "../services/lifecycle-service";
import { LoggerService } from "../services/logger-service";
import { OfflineService } from "../services/offline-service";
import { BaseSigner } from "../signer/base-signer";
import { MutableWalletAccountStore } from "../signer/wallet-account-store";
import { AsyncLocalMapStorage } from "../storage/async-local-storage";
import { ChromeSessionStorage } from "../storage/chrome-session-storage";
import { IndexedDBStorage } from "../storage/indexeddb-storage";
import { MemoryStorage } from "../storage/memory-storage";
import { describe, expect, test } from "../test-fixtures";
import { createMockRelayer } from "../test-fixtures/relayer";
import { Token, WrappedToken } from "../token";
import { vaultBatcherAbi } from "../vaults/abi/vault-batcher.abi";
import { vaultRouterAbi } from "../vaults/abi/vault-router.abi";
import { createVault, Vault, VaultBatcher, VaultGroup } from "../vaults";
import { ViemProvider } from "../viem/viem-provider";
import { ViemSigner } from "../viem/viem-signer";
import { EncryptWorkerClient } from "../worker/encrypt-worker-client";
import { DefaultRegistryAddresses, WrappersRegistry } from "../wrappers-registry";
import { ZamaSDK } from "../zama-sdk";

/**
 * Runtime locks against in-process tampering. A dependency that patches a class
 * (`Class.prototype.method = …`), reassigns a field on a live instance
 * (`sdk.registry = fake`) or shadows a getter (`Object.defineProperty(vault, …)`)
 * must fail at its own line, with a TypeError, before any transaction is built.
 * Every case below was first run as a working attack against an unlocked build.
 */

const FAKE = "0x000000000000000000000000000000000000dEaD" as Address;
/** Anvil's first well-known dev key; nothing is signed with it here. */
const ANVIL_DEV_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const DEPOSIT_BATCHER = "0x7777777777777777777777777777777777777777" as Address;
const REDEEM_BATCHER = "0x4D4d4D4d4d4D4D4d4D4D4D4d4d4d4d4D4D4d4d4D" as Address;

type AnyClass = abstract new (...args: never[]) => unknown;

const LOCKED_CLASSES: readonly [string, AnyClass][] = [
  ["ZamaSDK", ZamaSDK],
  ["Token", Token],
  ["WrappedToken", WrappedToken],
  ["WrappersRegistry", WrappersRegistry],
  ["Vault", Vault],
  ["VaultBatcher", VaultBatcher],
  ["VaultGroup", VaultGroup],
  ["Permits", Permits],
  ["Delegations", Delegations],
  ["Decryption", Decryption],
  ["Offline", Offline],
  ["BaseSigner", BaseSigner],
  ["ViemSigner", ViemSigner],
  ["EthersSigner", EthersSigner],
  ["MutableWalletAccountStore", MutableWalletAccountStore],
  ["ViemProvider", ViemProvider],
  ["EthersProvider", EthersProvider],
  ["FhevmRelayer", FhevmRelayer],
  ["ChainRouter", ChainRouter],
  ["LoggerService", LoggerService],
  ["MemoryStorage", MemoryStorage],
  ["IndexedDBStorage", IndexedDBStorage],
  ["AsyncLocalMapStorage", AsyncLocalMapStorage],
  ["ChromeSessionStorage", ChromeSessionStorage],
  ["CredentialService", CredentialService],
  ["TransportKeyPairVault", TransportKeyPairVault],
  ["DerivationSecretHolder", DerivationSecretHolder],
  ["PermissionStore", PermissionStore],
  ["CachingService", CachingService],
  ["DecryptionService", DecryptionService],
  ["DelegationService", DelegationService],
  ["EncryptionService", EncryptionService],
  ["LifecycleService", LifecycleService],
  ["OfflineService", OfflineService],
  ["EncryptWorkerClient", EncryptWorkerClient],
];

/** The first own method on the prototype, which a patch would target (none for classes that only use instance fields). */
function firstMethodName(cls: AnyClass): string | undefined {
  return Object.getOwnPropertyNames(cls.prototype).find((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(cls.prototype, key);
    return key !== "constructor" && typeof descriptor?.value === "function";
  });
}

describe("class prototypes", () => {
  test.each(LOCKED_CLASSES)("%s.prototype is frozen", (_name, cls) => {
    expect(Object.isFrozen(cls.prototype)).toBe(true);
  });

  test.each(LOCKED_CLASSES)("a method patch on %s throws and changes nothing", (_name, cls) => {
    const prototype = cls.prototype as Record<string, unknown>;
    expect(() => {
      prototype.injected = () => undefined;
    }).toThrow(TypeError);
    const method = firstMethodName(cls);
    if (method === undefined) {
      return;
    }
    const original = prototype[method];
    expect(() => {
      prototype[method] = () => undefined;
    }).toThrow(TypeError);
    expect(() => {
      Object.defineProperty(cls.prototype, method, { value: () => undefined });
    }).toThrow(TypeError);
    expect(prototype[method]).toBe(original);
  });
});

function expectLockedInstance(instance: object, field: string): void {
  expect(Object.isFrozen(instance)).toBe(true);
  const before = (instance as Record<string, unknown>)[field];
  expect(() => {
    (instance as Record<string, unknown>)[field] = FAKE;
  }).toThrow(TypeError);
  expect(() => {
    Object.defineProperty(instance, field, { value: FAKE });
  }).toThrow(TypeError);
  expect(() => {
    (instance as Record<string, unknown>).injected = FAKE;
  }).toThrow(TypeError);
  expect((instance as Record<string, unknown>)[field]).toBe(before);
}

describe("live instances", () => {
  test("the SDK, its registry and its namespaces", ({ sdk }) => {
    expectLockedInstance(sdk, "registry");
    expectLockedInstance(sdk, "provider");
    expectLockedInstance(sdk, "signer");
    expectLockedInstance(sdk.registry, "provider");
    expectLockedInstance(sdk.permits, "grantPermit");
    expectLockedInstance(sdk.delegations, "delegateDecryption");
    expectLockedInstance(sdk.decryption, "decryptValues");
    expectLockedInstance(sdk.offline, "preparePermit");
    expectLockedInstance(sdk.logger, "warn");
  });

  test("tokens", ({ token, wrappedToken }) => {
    expectLockedInstance(token, "address");
    expectLockedInstance(wrappedToken, "address");
    expectLockedInstance(wrappedToken, "sdk");
  });

  test("a vault and its batchers", ({ sdk }) => {
    const vault = createVault(sdk, {
      depositBatcher: DEPOSIT_BATCHER,
      redeemBatcher: REDEEM_BATCHER,
    });
    expectLockedInstance(vault, "depositBatcher");
    expectLockedInstance(vault, "redeemBatcher");
    expectLockedInstance(vault.depositBatcher, "address");
    expect(vault.depositBatcher.address).toBe(DEPOSIT_BATCHER);
  });

  test("the viem adapters", () => {
    const transport = http("http://127.0.0.1:1");
    const provider = new ViemProvider({ publicClient: createPublicClient({ transport }) });
    const signer = new ViemSigner({
      walletClient: createWalletClient({ transport, account: privateKeyToAccount(ANVIL_DEV_KEY) }),
    });
    expectLockedInstance(provider, "readContract");
    expectLockedInstance(signer, "writeContract");
    expectLockedInstance(signer.walletAccount, "getSnapshot");
    signer.dispose();
  });

  test("the chain router and storages", () => {
    const router = new ChainRouter(
      [hardhat],
      { [hardhat.id]: { type: "test", createRelayer: () => createMockRelayer() } },
      new LoggerService(),
    );
    expectLockedInstance(router, "switchChain");
    expectLockedInstance(new MemoryStorage(), "get");
    expectLockedInstance(new AsyncLocalMapStorage(), "get");
  });
});

describe("exported tables", () => {
  test("the default registry addresses are frozen", () => {
    expect(Object.isFrozen(DefaultRegistryAddresses)).toBe(true);
  });

  test.each([
    ["aclAbi", aclAbi],
    ["confidentialWrapperAbi", confidentialWrapperAbi],
    ["erc165Abi", erc165Abi],
    ["erc1363Abi", erc1363Abi],
    ["wrappersRegistryAbi", wrappersRegistryAbi],
    ["vaultBatcherAbi", vaultBatcherAbi],
    ["vaultRouterAbi", vaultRouterAbi],
  ])("%s is frozen down to every entry", (_name, abi) => {
    expect(Object.isFrozen(abi)).toBe(true);
    for (const entry of abi as readonly Record<string, unknown>[]) {
      expect(Object.isFrozen(entry)).toBe(true);
      for (const value of Object.values(entry)) {
        if (typeof value === "object" && value !== null) {
          expect(Object.isFrozen(value)).toBe(true);
        }
      }
    }
  });
});
