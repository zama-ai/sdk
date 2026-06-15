// oxlint-disable no-empty-pattern
// oxlint-disable eslint-plugin-react-hooks/rules-of-hooks
import { vi } from "vitest";
import type { FheChain } from "../chains/types";
import type { ChainRouter } from "../relayer/chain-router";
import type { RelayerSDK } from "../relayer/relayer-sdk";
import type { ChainFixtures } from "./chain";
import {
  ACL,
  TEST_PRIVATE_KEY,
  TEST_PUBLIC_KEY,
  TOKEN,
  VALID_ENCRYPTED_VALUE,
  VALID_INPUT_PROOF,
} from "./constants";
import type { FixturesOf } from "./types";

export function createMockRelayer(overrides: Partial<RelayerSDK> = {}): RelayerSDK {
  return {
    generateKeypair: vi.fn().mockResolvedValue({
      publicKey: TEST_PUBLIC_KEY,
      privateKey: TEST_PRIVATE_KEY,
    }),
    createEIP712: vi.fn().mockResolvedValue({
      domain: {
        name: "test",
        version: "1",
        chainId: 1,
        verifyingContract: "0xkms",
      },
      types: { UserDecryptRequestVerification: [] },
      message: {
        publicKey: TEST_PUBLIC_KEY,
        contractAddresses: [TOKEN],
        startTimestamp: 1000n,
        durationDays: 1n,
        extraData: "0x",
      },
    }),
    encrypt: vi.fn().mockResolvedValue({
      encryptedValues: [VALID_ENCRYPTED_VALUE],
      inputProof: VALID_INPUT_PROOF,
    }),
    userDecrypt: vi.fn().mockResolvedValue({
      [VALID_ENCRYPTED_VALUE as string]: 1000n,
    }),
    publicDecrypt: vi.fn().mockImplementation((handles: string[]) => {
      const clearValues: Record<string, bigint> = {};
      for (const h of handles) {
        clearValues[h] = 500n;
      }
      return Promise.resolve({
        clearValues,
        abiEncodedClearValues: "0x1f4",
        decryptionProof: "0xproof",
      });
    }),
    createDelegatedUserDecryptEIP712: vi.fn().mockResolvedValue({
      domain: {
        name: "test",
        version: "1",
        chainId: 1,
        verifyingContract: "0xkms",
      },
      types: { DelegatedUserDecryptRequestVerification: [] },
      message: {},
    }),
    delegatedUserDecrypt: vi.fn().mockResolvedValue({
      [VALID_ENCRYPTED_VALUE as string]: 1000n,
    }),
    requestZKProofVerification: vi.fn(),
    getAclAddress: vi.fn().mockResolvedValue(ACL),
    getPublicKey: vi.fn().mockResolvedValue({
      publicKeyId: "pk-1",
      publicKey: new Uint8Array([1]),
    }),
    getPublicParams: vi.fn().mockResolvedValue({
      publicParams: new Uint8Array([2]),
      publicParamsId: "pp-1",
    }),
    terminate: vi.fn(),
    ...overrides,
  };
}

/**
 * Build a `ChainRouter`-shaped mock for a single chain whose `relayer` getter
 * and `relayerForChain` method both resolve to the given relayer. Suitable for
 * service-layer tests that don't exercise chain-switch behaviour.
 */
export function createMockRouter(relayer: RelayerSDK, chain: FheChain): ChainRouter {
  const router = {
    chains: [chain] as readonly FheChain[],
    chain,
    relayer,
    relayerForChain: vi.fn(() => relayer),
    switchChain: vi.fn(),
    terminate: vi.fn(),
    [Symbol.dispose]: vi.fn(),
  };
  return router as unknown as ChainRouter;
}

export interface RelayerFixtures {
  relayer: RelayerSDK;
  router: ChainRouter;
  createMockRelayer: typeof createMockRelayer;
  createMockRouter: typeof createMockRouter;
}

export const relayerFixtures: FixturesOf<RelayerFixtures, ChainFixtures> = {
  relayer: async ({}, use) => {
    await use(createMockRelayer());
  },
  router: async ({ relayer, chain }, use) => {
    await use(createMockRouter(relayer, chain));
  },
  createMockRelayer: async ({}, use) => {
    await use(createMockRelayer);
  },
  createMockRouter: async ({}, use) => {
    await use(createMockRouter);
  },
};
