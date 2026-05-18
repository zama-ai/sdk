// oxlint-disable no-empty-pattern
import { vi } from "vitest";
import type { Address } from "viem";
import { createMockSigner } from "@zama-fhe/sdk/test-fixtures";
import type { Token } from "@zama-fhe/sdk/token";
import type { GenericSigner } from "@zama-fhe/sdk/types";
import type { FixturesOf } from "./types";

const MOCK_TOKEN_ADDRESS = "0xtoken" as Address;

function createMockToken(
  address: Address = MOCK_TOKEN_ADDRESS,
  signer: GenericSigner = createMockSigner(),
): Token {
  const mockResult = { txHash: "0xtx", receipt: { logs: [] } };
  return {
    address,
    signer,
    confidentialTransfer: vi.fn().mockResolvedValue(mockResult),
    confidentialTransferFrom: vi.fn().mockResolvedValue(mockResult),
    setOperator: vi.fn().mockResolvedValue(mockResult),
    approveUnderlying: vi.fn().mockResolvedValue(mockResult),
    shield: vi.fn().mockResolvedValue(mockResult),
    unwrap: vi.fn().mockResolvedValue(mockResult),
    unwrapAll: vi.fn().mockResolvedValue(mockResult),
    finalizeUnwrap: vi.fn().mockResolvedValue(mockResult),
    unshield: vi.fn().mockResolvedValue(mockResult),
    unshieldAll: vi.fn().mockResolvedValue(mockResult),
    resumeUnshield: vi.fn().mockResolvedValue(mockResult),
    delegateDecryption: vi.fn().mockResolvedValue(mockResult),
    revokeDelegation: vi.fn().mockResolvedValue(mockResult),
  } as unknown as Token;
}

export interface TokenFixtures {
  token: Token;
}

export const tokenFixtures: FixturesOf<TokenFixtures> = {
  token: async ({}, use) => {
    await use(createMockToken());
  },
};
