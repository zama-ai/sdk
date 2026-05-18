// oxlint-disable jest/expect-expect
// oxlint-disable jest/no-disabled-tests
import { test as base } from "vitest";
import { addressFixtures, type AddressFixtures } from "./addresses";
import { providerFixtures, type ProviderFixtures } from "./provider";
import { queryContextFixtures, type QueryContextFixtures } from "./query-context";
import { relayerFixtures, type RelayerFixtures } from "./relayer";
import { sdkFixtures, type SdkFixtures } from "./sdk";
import { serviceFixtures, type ServiceFixtures } from "./services";
import { signerFixtures, type SignerFixtures } from "./signer";
import { storageFixtures, type StorageFixtures } from "./storage";
import { tokenFixtures, type TokenFixtures } from "./token";

/**
 * Builder chain — each `.extend()` adds a fixture group on top of the previous
 * test. Order matters: later groups can destructure earlier groups' fixtures.
 *
 *   addresses → relayer → signer → provider → storage → services → sdk → token
 */
export const test = base
  .extend<AddressFixtures>(addressFixtures)
  .extend<RelayerFixtures>(relayerFixtures)
  .extend<SignerFixtures>(signerFixtures)
  .extend<ProviderFixtures>(providerFixtures)
  .extend<StorageFixtures>(storageFixtures)
  .extend<ServiceFixtures>(serviceFixtures)
  .extend<SdkFixtures>(sdkFixtures)
  .extend<TokenFixtures>(tokenFixtures)
  .extend<QueryContextFixtures>(queryContextFixtures);

export const it = test;

export {
  ACL,
  DELEGATE,
  DELEGATOR,
  TEST_ADDR_A,
  TEST_ADDR_B,
  TEST_PRIVATE_KEY,
  TEST_PUBLIC_KEY,
  TEST_SIGNATURE,
  TOKEN,
  USER,
  VALID_HANDLE,
  WRAPPER,
} from "./constants";
export { createMockChain } from "./chain";
export { createMockRelayer } from "./relayer";
export { createMockSigner, type MockSigner } from "./signer";
export { createMockProvider } from "./provider";
export { createMockStorage } from "./storage";
export type { AddressFixtures } from "./addresses";
export type { RelayerFixtures } from "./relayer";
export type { SignerFixtures, CreateMockSignerFn } from "./signer";
export type { ProviderFixtures } from "./provider";
export type { StorageFixtures } from "./storage";
export type {
  ServiceFixtures,
  CreateCredentialServiceFn,
  CreateDelegationServiceFn,
  CreateDecryptionServiceFn,
  CreateEncryptionServiceFn,
  CreateLifecycleServiceFn,
} from "./services";
export type { SdkFixtures, CreateSDKFn } from "./sdk";
export type {
  TokenFixtures,
  CreateTokenFn,
  CreateWrappedTokenFn,
  CreateMockTokenFn,
  CreateMockWrappedTokenFn,
} from "./token";

export { afterEach, beforeEach, describe, expect, vi, type Mock } from "vitest";
