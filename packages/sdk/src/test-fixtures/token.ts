import { vi } from "vitest";
import type { Address, Hex } from "viem";
import type { EncryptedValue } from "../relayer/types";
import { Token } from "../token/token";
import { WrappedToken } from "../token/wrapped-token";
import type { GenericSigner, TransactionResult } from "../types";
import type { ZamaSDK } from "../zama-sdk";
import type { AddressFixtures } from "./addresses";
import type { SdkFixtures } from "./sdk";
import type { SignerFixtures } from "./signer";
import type { FixturesOf } from "./types";

export type CreateTokenFn = (sdk: ZamaSDK, address?: Address) => Token;
export type CreateWrappedTokenFn = (sdk: ZamaSDK, address?: Address) => WrappedToken;

export type CreateMockTokenFn = (
  addressOrArgs?:
    | Address
    | {
        address?: Address;
        signer?: GenericSigner;
        txResult?: TransactionResult;
      },
) => Token;

export type CreateMockWrappedTokenFn = (
  addressOrArgs?:
    | Address
    | {
        address?: Address;
        signer?: GenericSigner;
        txResult?: TransactionResult;
      },
) => WrappedToken;

function createMockTokenInternal(address: Address, signer: GenericSigner): Token {
  const mockSdk = {
    signer,
    decryptValues: vi.fn().mockResolvedValue({}),
    allow: vi.fn().mockResolvedValue(undefined),
    isAllowed: vi.fn().mockResolvedValue(true),
    revokePermits: vi.fn().mockResolvedValue(undefined),
  };
  return {
    address,
    sdk: mockSdk,
    balanceOf: vi.fn().mockResolvedValue(123n),
    decryptBalanceAs: vi.fn().mockResolvedValue(123n),
    confidentialBalanceOf: vi.fn().mockResolvedValue(("0x" + "aa".repeat(32)) as EncryptedValue),
    name: vi.fn().mockResolvedValue("Test"),
    symbol: vi.fn().mockResolvedValue("TST"),
    decimals: vi.fn().mockResolvedValue(18),
    isConfidential: vi.fn().mockResolvedValue(true),
    isWrapper: vi.fn().mockResolvedValue(false),
    isOperator: vi.fn().mockResolvedValue(false),
  } as unknown as Token;
}

const DEFAULT_TX_RESULT: TransactionResult = {
  txHash: ("0x" + "11".repeat(32)) as Hex,
  receipt: { logs: [] },
};

export interface TokenFixtures {
  token: Token;
  wrappedToken: WrappedToken;
  mockToken: Token;
  mockWrappedToken: WrappedToken;
  createToken: CreateTokenFn;
  createWrappedToken: CreateWrappedTokenFn;
  createMockToken: CreateMockTokenFn;
  createMockWrappedToken: CreateMockWrappedTokenFn;
}

type TokenDeps = AddressFixtures & SignerFixtures & SdkFixtures;

export const tokenFixtures: FixturesOf<TokenFixtures, TokenDeps> = {
  token: async ({ sdk, tokenAddress }, use) => {
    await use(new Token(sdk, tokenAddress));
  },
  wrappedToken: async ({ sdk, wrapperAddress }, use) => {
    await use(new WrappedToken(sdk, wrapperAddress));
  },
  mockToken: async ({ createMockToken }, use) => {
    await use(createMockToken());
  },
  mockWrappedToken: async ({ createMockWrappedToken }, use) => {
    await use(createMockWrappedToken());
  },
  createToken: async ({ tokenAddress }, use) => {
    const factory: CreateTokenFn = (sdk, address) => new Token(sdk, address ?? tokenAddress);
    await use(factory);
  },
  createWrappedToken: async ({ wrapperAddress }, use) => {
    const factory: CreateWrappedTokenFn = (sdk, address) =>
      new WrappedToken(sdk, address ?? wrapperAddress);
    await use(factory);
  },
  createMockToken: async ({ tokenAddress, signer }, use) => {
    const factory: CreateMockTokenFn = (addressOrArgs) => {
      const addr =
        typeof addressOrArgs === "string"
          ? addressOrArgs
          : (addressOrArgs?.address ?? tokenAddress);
      const sig = typeof addressOrArgs === "object" ? (addressOrArgs?.signer ?? signer) : signer;
      const txResult =
        typeof addressOrArgs === "object"
          ? (addressOrArgs?.txResult ?? DEFAULT_TX_RESULT)
          : DEFAULT_TX_RESULT;
      const base = createMockTokenInternal(addr, sig);
      return {
        // oxlint-disable-next-line typescript-eslint/no-misused-spread
        ...base,
        confidentialTransfer: vi.fn().mockResolvedValue(txResult),
        confidentialTransferFrom: vi.fn().mockResolvedValue(txResult),
        confidentialTransferAndCall: vi.fn().mockResolvedValue(txResult),
        confidentialTransferFromAndCall: vi.fn().mockResolvedValue(txResult),
        setOperator: vi.fn().mockResolvedValue(txResult),
      } as unknown as Token;
    };
    await use(factory);
  },
  createMockWrappedToken: async ({ wrapperAddress, signer }, use) => {
    const factory: CreateMockWrappedTokenFn = (addressOrArgs) => {
      const addr =
        typeof addressOrArgs === "string"
          ? addressOrArgs
          : (addressOrArgs?.address ?? wrapperAddress);
      const sig = typeof addressOrArgs === "object" ? (addressOrArgs?.signer ?? signer) : signer;
      const txResult =
        typeof addressOrArgs === "object"
          ? (addressOrArgs?.txResult ?? DEFAULT_TX_RESULT)
          : DEFAULT_TX_RESULT;
      const base = createMockTokenInternal(addr, sig);
      return {
        // oxlint-disable-next-line typescript-eslint/no-misused-spread
        ...base,
        confidentialTransfer: vi.fn().mockResolvedValue(txResult),
        confidentialTransferFrom: vi.fn().mockResolvedValue(txResult),
        confidentialTransferAndCall: vi.fn().mockResolvedValue(txResult),
        confidentialTransferFromAndCall: vi.fn().mockResolvedValue(txResult),
        setOperator: vi.fn().mockResolvedValue(txResult),
        underlying: vi.fn().mockResolvedValue(addr),
        allowance: vi.fn().mockResolvedValue(0n),
        approveUnderlying: vi.fn().mockResolvedValue(txResult),
        shield: vi.fn().mockResolvedValue(txResult),
        unwrap: vi.fn().mockResolvedValue(txResult),
        unwrapAll: vi.fn().mockResolvedValue(txResult),
        finalizeUnwrap: vi.fn().mockResolvedValue(txResult),
        unshield: vi.fn().mockResolvedValue(txResult),
        unshieldAll: vi.fn().mockResolvedValue(txResult),
        resumeUnshield: vi.fn().mockResolvedValue(txResult),
      } as unknown as WrappedToken;
    };
    await use(factory);
  },
};
