import { vi } from "vitest";
import type { ReadonlyToken } from "../../token/readonly-token";
import type { Token } from "../../token/token";
import type { Address, GenericSigner, GenericStringStorage, Hex } from "../../token/token.types";
import type { RelayerSDK } from "../../relayer/relayer-sdk";

const USER = "0x2222222222222222222222222222222222222222" as Address;
const TX_HASH = "0x1111111111111111111111111111111111111111111111111111111111111111" as Hex;

export function createMockSigner(): GenericSigner {
  return {
    getAddress: vi.fn().mockResolvedValue(USER),
    signTypedData: vi.fn().mockResolvedValue("0xsig" as Hex),
    writeContract: vi.fn().mockResolvedValue(TX_HASH),
    readContract: vi.fn().mockResolvedValue("0x0"),
    waitForTransactionReceipt: vi.fn().mockResolvedValue({ logs: [] }),
    getChainId: vi.fn().mockResolvedValue(31337),
  };
}

export function createMockStorage(): GenericStringStorage {
  return {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
  };
}

export function createMockRelayer(): RelayerSDK {
  return {
    generateKeypair: vi.fn().mockResolvedValue({ publicKey: "0xpub", privateKey: "0xpriv" }),
    createEIP712: vi.fn().mockResolvedValue({
      domain: { name: "test", version: "1", chainId: 1, verifyingContract: "0xkms" },
      types: { UserDecryptRequestVerification: [] },
      message: {
        publicKey: "0xpub",
        contractAddresses: [],
        startTimestamp: 1000n,
        durationDays: 1n,
        extraData: "0x",
      },
    }),
    encrypt: vi
      .fn()
      .mockResolvedValue({ handles: [new Uint8Array([1, 2, 3])], inputProof: new Uint8Array([4]) }),
    userDecrypt: vi.fn().mockResolvedValue({}),
    publicDecrypt: vi.fn().mockResolvedValue({
      clearValues: {},
      abiEncodedClearValues: "0",
      decryptionProof: "0xproof",
    }),
    createDelegatedUserDecryptEIP712: vi.fn().mockResolvedValue({}),
    delegatedUserDecrypt: vi.fn().mockResolvedValue({}),
    requestZKProofVerification: vi.fn().mockResolvedValue("0xproof"),
    getPublicKey: vi
      .fn()
      .mockResolvedValue({ publicKeyId: "pk-1", publicKey: new Uint8Array([1]) }),
    getPublicParams: vi
      .fn()
      .mockResolvedValue({ publicParamsId: "pp-1", publicParams: new Uint8Array([2]) }),
    terminate: vi.fn(),
  } as unknown as RelayerSDK;
}

export function createMockReadonlyToken(address: Address = USER): ReadonlyToken {
  return {
    address,
    signer: createMockSigner(),
    decryptBalance: vi.fn().mockResolvedValue(123n),
    decryptHandles: vi.fn().mockResolvedValue(new Map()),
    confidentialBalanceOf: vi
      .fn()
      .mockResolvedValue(
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address,
      ),
    name: vi.fn().mockResolvedValue("Test"),
    symbol: vi.fn().mockResolvedValue("TST"),
    decimals: vi.fn().mockResolvedValue(18),
    isConfidential: vi.fn().mockResolvedValue(true),
    isWrapper: vi.fn().mockResolvedValue(false),
    allowance: vi.fn().mockResolvedValue(0n),
    discoverWrapper: vi.fn().mockResolvedValue(null),
    isApproved: vi.fn().mockResolvedValue(false),
  } as unknown as ReadonlyToken;
}

export function createMockToken(address: Address = USER): Token {
  return {
    ...createMockReadonlyToken(address),
    shield: vi.fn().mockResolvedValue({ txHash: TX_HASH, receipt: { logs: [] } }),
    shieldETH: vi.fn().mockResolvedValue({ txHash: TX_HASH, receipt: { logs: [] } }),
    confidentialTransfer: vi.fn().mockResolvedValue({ txHash: TX_HASH, receipt: { logs: [] } }),
    confidentialTransferFrom: vi.fn().mockResolvedValue({ txHash: TX_HASH, receipt: { logs: [] } }),
    approve: vi.fn().mockResolvedValue({ txHash: TX_HASH, receipt: { logs: [] } }),
    approveUnderlying: vi.fn().mockResolvedValue({ txHash: TX_HASH, receipt: { logs: [] } }),
    unshield: vi.fn().mockResolvedValue({ txHash: TX_HASH, receipt: { logs: [] } }),
    unshieldAll: vi.fn().mockResolvedValue({ txHash: TX_HASH, receipt: { logs: [] } }),
    resumeUnshield: vi.fn().mockResolvedValue({ txHash: TX_HASH, receipt: { logs: [] } }),
    unwrap: vi.fn().mockResolvedValue({ txHash: TX_HASH, receipt: { logs: [] } }),
    unwrapAll: vi.fn().mockResolvedValue({ txHash: TX_HASH, receipt: { logs: [] } }),
    finalizeUnwrap: vi.fn().mockResolvedValue({ txHash: TX_HASH, receipt: { logs: [] } }),
  } as unknown as Token;
}
