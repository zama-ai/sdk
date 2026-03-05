import { describe, it, expect, vi, beforeEach } from "vitest";
import { EncryptionFailedError, ConfigurationError, NotSupportedError } from "../../token/errors";

// ---------------------------------------------------------------------------
// Hoisted mocks (available inside vi.mock factories)
// ---------------------------------------------------------------------------

const { mockInstance, mockCreateCleartextInstance } = vi.hoisted(() => {
  const mockInstance = {
    generateKeypair: vi.fn(),
    createEncryptedInput: vi.fn(),
    createEIP712: vi.fn(),
    createDelegatedUserDecryptEIP712: vi.fn(),
    publicDecrypt: vi.fn(),
    userDecrypt: vi.fn(),
    delegatedUserDecrypt: vi.fn(),
    requestZKProofVerification: vi.fn(),
    getPublicKey: vi.fn(),
    getPublicParams: vi.fn(),
  };

  const mockCreateCleartextInstance = vi.fn().mockResolvedValue(mockInstance);

  return { mockInstance, mockCreateCleartextInstance };
});

vi.mock("../../cleartext/cleartext-instance", () => ({
  createCleartextInstance: mockCreateCleartextInstance,
}));

// ---------------------------------------------------------------------------
// Import after mocks are registered
// ---------------------------------------------------------------------------

import {
  RelayerCleartext,
  type RelayerCleartextConfig,
  type RelayerCleartextMultiConfig,
} from "../relayer-cleartext";
import type { EncryptInput, EncryptParams } from "../relayer-sdk.types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CHAIN_ID = 31337;
const CONTRACT_ADDR = "0xCONTRACT" as const;
const USER_ADDR = "0xUSER" as const;
const SIGNER_ADDR = "0xSIGNER" as const;

/** Minimal valid transport config for the test chain. */
function validTransport(): Partial<Record<string, unknown>> {
  return {
    network: "http://localhost:8545",
    cleartextExecutorAddress: "0x0000000000000000000000000000000000000001",
    coprocessorSignerPrivateKey: "0x" + "ab".repeat(32),
    kmsSignerPrivateKey: "0x" + "cd".repeat(32),
  };
}

function makeConfig(overrides?: Partial<RelayerCleartextMultiConfig>): RelayerCleartextMultiConfig {
  return {
    transports: { [CHAIN_ID]: validTransport() as never },
    getChainId: vi.fn().mockResolvedValue(CHAIN_ID),
    ...overrides,
  };
}

function encryptParams(values: EncryptInput[] = [{ value: 42n, type: "euint64" }]): EncryptParams {
  return { contractAddress: CONTRACT_ADDR, userAddress: USER_ADDR, values };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RelayerCleartext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateCleartextInstance.mockResolvedValue(mockInstance);
  });

  // -----------------------------------------------------------------------
  // 1. Lazy init — concurrent encrypt() calls initialise only once
  // -----------------------------------------------------------------------
  describe("lazy init", () => {
    it("initialises only once when encrypt() is called concurrently", async () => {
      const mockInput = {
        add64: vi.fn(),
        encrypt: vi.fn().mockResolvedValue({ handles: ["0xh1"], inputProof: "0xproof" }),
      };
      mockInstance.createEncryptedInput.mockReturnValue(mockInput);

      const relayer = new RelayerCleartext(makeConfig());

      // Fire two concurrent encrypt() calls
      const [r1, r2] = await Promise.all([
        relayer.encrypt(encryptParams()),
        relayer.encrypt(encryptParams()),
      ]);

      expect(mockCreateCleartextInstance).toHaveBeenCalledTimes(1);
      expect(r1).toEqual({ handles: ["0xh1"], inputProof: "0xproof" });
      expect(r2).toEqual({ handles: ["0xh1"], inputProof: "0xproof" });
    });
  });

  // -----------------------------------------------------------------------
  // 2. Chain switch — changing chainId discards old instance
  // -----------------------------------------------------------------------
  describe("chain switch", () => {
    it("creates a new instance when chainId changes", async () => {
      const NEW_CHAIN_ID = 9999;
      let currentChainId = CHAIN_ID;

      const config = makeConfig({
        transports: {
          [CHAIN_ID]: validTransport() as never,
          [NEW_CHAIN_ID]: validTransport() as never,
        },
        getChainId: vi.fn(async () => currentChainId),
      });

      mockInstance.generateKeypair.mockReturnValue({
        publicKey: "0xpub",
        privateKey: "0xpriv",
      });

      const relayer = new RelayerCleartext(config);

      // First call — init with chain CHAIN_ID
      await relayer.generateKeypair();
      expect(mockCreateCleartextInstance).toHaveBeenCalledTimes(1);

      // Switch chain
      currentChainId = NEW_CHAIN_ID;

      // Second call — should discard old instance and create new one
      await relayer.generateKeypair();
      expect(mockCreateCleartextInstance).toHaveBeenCalledTimes(2);
    });
  });

  // -----------------------------------------------------------------------
  // 3. Terminate + auto-restart
  // -----------------------------------------------------------------------
  describe("terminate + auto-restart", () => {
    it("auto-restarts after terminate() when encrypt() is called", async () => {
      const mockInput = {
        add64: vi.fn(),
        encrypt: vi.fn().mockResolvedValue({ handles: ["0xh1"], inputProof: "0xproof" }),
      };
      mockInstance.createEncryptedInput.mockReturnValue(mockInput);

      const relayer = new RelayerCleartext(makeConfig());

      // First encrypt — creates instance
      await relayer.encrypt(encryptParams([{ value: 1n, type: "euint64" }]));
      expect(mockCreateCleartextInstance).toHaveBeenCalledTimes(1);

      // Terminate
      relayer.terminate();

      // Second encrypt — should auto-restart and create a new instance
      await relayer.encrypt(encryptParams([{ value: 1n, type: "euint64" }]));
      expect(mockCreateCleartextInstance).toHaveBeenCalledTimes(2);
    });
  });

  // -----------------------------------------------------------------------
  // 4. Missing transport config
  // -----------------------------------------------------------------------
  describe("missing transport config", () => {
    it("throws ConfigurationError when no transport config exists for chainId", async () => {
      const relayer = new RelayerCleartext(
        makeConfig({
          transports: {}, // no config for CHAIN_ID
        }),
      );

      await expect(
        relayer.encrypt(encryptParams([{ value: 1n, type: "euint64" }])),
      ).rejects.toThrow(ConfigurationError);

      await expect(
        relayer.encrypt(encryptParams([{ value: 1n, type: "euint64" }])),
      ).rejects.toThrow(/No cleartext transport config for chainId/);
    });
  });

  // -----------------------------------------------------------------------
  // 5. Incomplete config (missing cleartextExecutorAddress)
  // -----------------------------------------------------------------------
  describe("incomplete config", () => {
    it("throws ConfigurationError with cause when cleartextExecutorAddress is missing", async () => {
      // Use a chain ID with no DefaultConfigs entry so the base config is empty
      // and only the (incomplete) override is used.
      const CUSTOM_CHAIN = 99999;
      const transport = validTransport();
      delete transport.cleartextExecutorAddress;

      const relayer = new RelayerCleartext({
        transports: { [CUSTOM_CHAIN]: transport as never },
        getChainId: vi.fn().mockResolvedValue(CUSTOM_CHAIN),
      });

      const err = await relayer
        .encrypt(encryptParams([{ value: 1n, type: "euint64" }]))
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ConfigurationError);
      expect((err as ConfigurationError).message).toMatch(/Incomplete cleartext config/);
      expect((err as ConfigurationError).cause).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // 6. encrypt() wraps add64 overflow in descriptive error
  // -----------------------------------------------------------------------
  describe("encrypt() add64 overflow", () => {
    it("throws a descriptive error when value exceeds uint64 max", async () => {
      const mockInput = {
        add64: vi.fn().mockImplementation(() => {
          throw new Error("value out of range");
        }),
        encrypt: vi.fn(),
      };
      mockInstance.createEncryptedInput.mockReturnValue(mockInput);

      const relayer = new RelayerCleartext(makeConfig());

      const tooBig = 2n ** 64n; // exceeds uint64 max
      const input: EncryptInput = { value: tooBig, type: "euint64" };

      await expect(relayer.encrypt(encryptParams([input]))).rejects.toThrow(EncryptionFailedError);
      await expect(relayer.encrypt(encryptParams([input]))).rejects.toThrow(
        /failed for type "euint64"/,
      );
    });
  });

  // -----------------------------------------------------------------------
  // 7. requestZKProofVerification throws EncryptionFailedError
  // -----------------------------------------------------------------------
  describe("requestZKProofVerification", () => {
    it("throws NotSupportedError indicating unsupported in cleartext mode", async () => {
      const relayer = new RelayerCleartext(makeConfig());

      await expect(relayer.requestZKProofVerification({} as never)).rejects.toThrow(
        NotSupportedError,
      );
      await expect(relayer.requestZKProofVerification({} as never)).rejects.toThrow(
        /not supported in cleartext mode/,
      );
    });
  });

  // -----------------------------------------------------------------------
  // 8. convertToBigIntRecord integration — boolean values become bigint
  // -----------------------------------------------------------------------
  describe("userDecrypt boolean conversion", () => {
    it("converts boolean values to bigint in userDecrypt result", async () => {
      mockInstance.userDecrypt.mockResolvedValue({
        "0xhandle1": true,
        "0xhandle2": false,
        "0xhandle3": 42n,
      });

      const relayer = new RelayerCleartext(makeConfig());

      const result = await relayer.userDecrypt({
        handles: ["0xhandle1", "0xhandle2", "0xhandle3"],
        contractAddress: CONTRACT_ADDR,
        privateKey: "0xpriv",
        publicKey: "0xpub",
        signature: "0xsig",
        signedContractAddresses: [CONTRACT_ADDR],
        signerAddress: SIGNER_ADDR,
        startTimestamp: 1000,
        durationDays: 7,
      });

      expect(result).toEqual({
        "0xhandle1": 1n,
        "0xhandle2": 0n,
        "0xhandle3": 42n,
      });
    });
  });

  // -----------------------------------------------------------------------
  // 9. generateKeypair
  // -----------------------------------------------------------------------
  describe("generateKeypair", () => {
    it("returns publicKey and privateKey strings from the instance", async () => {
      mockInstance.generateKeypair.mockReturnValue({
        publicKey: "0xpublickey123",
        privateKey: "0xprivatekey456",
      });

      const relayer = new RelayerCleartext(makeConfig());
      const keypair = await relayer.generateKeypair();

      expect(keypair).toEqual({
        publicKey: "0xpublickey123",
        privateKey: "0xprivatekey456",
      });
    });
  });

  // -----------------------------------------------------------------------
  // 10. getPublicKey / getPublicParams return mock data
  // -----------------------------------------------------------------------
  describe("getPublicKey", () => {
    it("returns mock public key data", async () => {
      const relayer = new RelayerCleartext(makeConfig());
      const result = await relayer.getPublicKey();

      expect(result).toEqual({
        publicKeyId: "mock-public-key-id",
        publicKey: new Uint8Array(32),
      });
    });
  });

  describe("getPublicParams", () => {
    it("returns mock public params data", async () => {
      const relayer = new RelayerCleartext(makeConfig());
      const result = await relayer.getPublicParams(2048);

      expect(result).toEqual({
        publicParamsId: "mock-public-params-id",
        publicParams: new Uint8Array(32),
      });
    });
  });

  // -----------------------------------------------------------------------
  // 11. Single-transport mode
  // -----------------------------------------------------------------------
  describe("single-transport mode", () => {
    it("accepts a single config with chainId and initialises correctly", async () => {
      mockInstance.generateKeypair.mockReturnValue({
        publicKey: "0xpub",
        privateKey: "0xpriv",
      });

      const relayer = new RelayerCleartext({
        ...validTransport(),
        chainId: CHAIN_ID,
      } as RelayerCleartextConfig);

      const keypair = await relayer.generateKeypair();

      expect(mockCreateCleartextInstance).toHaveBeenCalledTimes(1);
      expect(keypair).toEqual({ publicKey: "0xpub", privateKey: "0xpriv" });
    });

    it("throws ConfigurationError when single config is missing chainId", () => {
      const transport = validTransport();
      // No chainId — should throw synchronously in constructor
      expect(() => new RelayerCleartext(transport as RelayerCleartextConfig)).toThrow(
        ConfigurationError,
      );
      expect(() => new RelayerCleartext(transport as RelayerCleartextConfig)).toThrow(/chainId/);
    });
  });
});
