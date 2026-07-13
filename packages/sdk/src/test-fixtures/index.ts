import { test as base } from "vitest";
import { addressFixtures, type AddressFixtures } from "./addresses";
import { chainFixtures, type ChainFixtures } from "./chain";
import { providerFixtures, type ProviderFixtures } from "./provider";
import { queryContextFixtures, type QueryContextFixtures } from "./query-context";
import { relayerFixtures, type RelayerFixtures } from "./relayer";
import { routerFixtures, type RouterFixtures } from "./router";
import { sdkFixtures, type SdkFixtures } from "./sdk";
import { serviceFixtures, type ServiceFixtures } from "./services";
import { signerFixtures, type SignerFixtures } from "./signer";
import { storageFixtures, type StorageFixtures } from "./storage";
import { tokenFixtures, type TokenFixtures } from "./token";

export type SDKTestFixtures = AddressFixtures &
  ChainFixtures &
  RelayerFixtures &
  RouterFixtures &
  SignerFixtures &
  ProviderFixtures &
  StorageFixtures &
  ServiceFixtures &
  SdkFixtures &
  TokenFixtures &
  QueryContextFixtures;

export const test = base.extend<SDKTestFixtures>({
  ...addressFixtures,
  ...chainFixtures,
  ...relayerFixtures,
  ...routerFixtures,
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
export type { ProviderFixtures } from "./provider";
export type { RelayerFixtures } from "./relayer";
export type { CreateMockRouterOverrides, RouterFixtures } from "./router";
export { createMockRouter } from "./router";
export type { CreateSDKFn, SdkFixtures } from "./sdk";
export type {
  CreateCredentialServiceFn,
  CreateDecryptionServiceFn,
  CreateDelegationServiceFn,
  CreateEncryptionServiceFn,
  CreateLifecycleServiceFn,
  ServiceFixtures,
} from "./services";
export type { CreateMockSignerFn, SignerFixtures } from "./signer";
export type { StorageFixtures } from "./storage";
export type {
  CreateMockTokenFn,
  CreateMockWrappedTokenFn,
  CreateTokenFn,
  CreateWrappedTokenFn,
  TokenFixtures,
} from "./token";

export { afterEach, beforeEach, describe, expect, vi, type Mock } from "vitest";
