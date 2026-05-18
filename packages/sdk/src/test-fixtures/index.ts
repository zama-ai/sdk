// oxlint-disable jest/expect-expect
// oxlint-disable jest/no-disabled-tests
import { test as base } from "vitest";
import { addressFixtures, type AddressFixtures } from "./addresses";
import { chainFixtures, type ChainFixtures } from "./chain";
import { providerFixtures, type ProviderFixtures } from "./provider";
import { queryContextFixtures, type QueryContextFixtures } from "./query-context";
import { relayerFixtures, type RelayerFixtures } from "./relayer";
import { sdkFixtures, type SdkFixtures } from "./sdk";
import { serviceFixtures, type ServiceFixtures } from "./services";
import { signerFixtures, type SignerFixtures } from "./signer";
import { storageFixtures, type StorageFixtures } from "./storage";
import { tokenFixtures, type TokenFixtures } from "./token";

export type SdkTestFixtures = AddressFixtures &
  ChainFixtures &
  RelayerFixtures &
  SignerFixtures &
  ProviderFixtures &
  StorageFixtures &
  ServiceFixtures &
  SdkFixtures &
  TokenFixtures &
  QueryContextFixtures;

/**
 * Single `.extend()` call with every fixture group spread in — vitest resolves
 * intra-call dependencies automatically (e.g. `cache` reads `storage`, `sdk`
 * reads `relayer/signer/provider/storage`). Avoids the cumulative
 * `AddBuilderWorker<...>` types a long `.extend(...).extend(...)` chain
 * produces, which TypeScript struggles to display and sometimes truncates.
 */
export const test = base.extend<SdkTestFixtures>({
  ...addressFixtures,
  ...chainFixtures,
  ...relayerFixtures,
  ...signerFixtures,
  ...providerFixtures,
  ...storageFixtures,
  ...serviceFixtures,
  ...sdkFixtures,
  ...tokenFixtures,
  ...queryContextFixtures,
});

export type { AddressFixtures } from "./addresses";
export type { ChainFixtures } from "./chain";
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
