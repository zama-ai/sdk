import { describe, it, expect, beforeEach } from "../../test-fixtures";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockWorkerClient, MockRelayerWorkerClient } = vi.hoisted(() => {
  const mockWorkerClient = {
    initWorker: vi.fn().mockResolvedValue(undefined),
    terminate: vi.fn(),
    updateCsrf: vi.fn().mockResolvedValue(undefined),
    generateKeypair: vi.fn(),
    createEIP712: vi.fn(),
    encrypt: vi.fn(),
    userDecrypt: vi.fn(),
    publicDecrypt: vi.fn(),
    createDelegatedUserDecryptEIP712: vi.fn(),
    delegatedUserDecrypt: vi.fn(),
    requestZKProofVerification: vi.fn(),
    getPublicKey: vi.fn(),
    getPublicParams: vi.fn(),
    getExtraData: vi.fn().mockResolvedValue({ result: "0x" }),
  };

  const MockRelayerWorkerClient = vi.fn(function () {
    return mockWorkerClient;
  });

  return { mockWorkerClient, MockRelayerWorkerClient };
});

vi.mock(import("../../worker/worker.client"), () => ({
  RelayerWorkerClient: MockRelayerWorkerClient,
}));

import { RelayerWeb } from "../relayer-web";
import type { Address } from "viem";

const MOCK_EIP712 = {
  domain: {
    name: "Decryption",
    version: "1",
    chainId: 1n,
    verifyingContract: "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
  },
  types: {
    EIP712Domain: [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" },
    ],
    UserDecryptRequestVerification: [
      { name: "publicKey", type: "bytes" },
      { name: "contractAddresses", type: "address[]" },
    ],
  },
  primaryType: "UserDecryptRequestVerification",
  message: {
    publicKey: "0xpub",
    contractAddresses: ["0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a"],
    startTimestamp: "1000",
    durationDays: "7",
    extraData: "0x",
  },
};

function createRelayer() {
  return new RelayerWeb({
    transports: { 1: {} },
    getChainId: async () => 1,
  });
}

describe("createEIP712 includes EIP712Domain type", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWorkerClient.createEIP712.mockResolvedValue(MOCK_EIP712);
  });

  it("adds EIP712Domain type with correct field types", async () => {
    const relayer = createRelayer();
    const result = await relayer.createEIP712(
      "0xpub",
      ["0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address],
      1000,
      7,
    );

    expect(result.types.EIP712Domain).toEqual([
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" },
    ]);

    relayer.terminate();
  });

  it("preserves UserDecryptRequestVerification type", async () => {
    const relayer = createRelayer();
    const result = await relayer.createEIP712(
      "0xpub",
      ["0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address],
      1000,
      7,
    );

    expect(result.types.UserDecryptRequestVerification).toEqual(
      MOCK_EIP712.types.UserDecryptRequestVerification,
    );

    relayer.terminate();
  });

  it("preserves domain and message fields", async () => {
    const relayer = createRelayer();
    const result = await relayer.createEIP712(
      "0xpub",
      ["0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address],
      1000,
      7,
    );

    expect(result.domain).toEqual(MOCK_EIP712.domain);
    expect(result.message).toEqual(MOCK_EIP712.message);

    relayer.terminate();
  });
});
