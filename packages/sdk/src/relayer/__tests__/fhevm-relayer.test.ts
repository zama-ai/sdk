import { beforeEach, describe, expect, test, vi } from "vitest";

const clients = vi.hoisted(() => {
  const makeBaseClient = () => ({
    init: vi.fn(async () => {}),
    decryptPublicValue: vi.fn(async () => ({ type: "uint64", value: 0n })),
    decryptPublicValues: vi.fn(async () => []),
    decryptPublicValuesWithSignatures: vi.fn(async () => ({
      clearValues: [],
      checkSignaturesArgs: { handlesList: [], abiEncodedCleartexts: "0x", decryptionProof: "0x" },
    })),
    fetchFheEncryptionKeyBytes: vi.fn(async () => new Uint8Array()),
    signDecryptionPermit: vi.fn(async () => ({ signature: "0x" })),
    serializeTransportKeyPair: vi.fn(() => "serialized-keypair"),
    serializeSignedDecryptionPermit: vi.fn(() => "serialized-permit"),
    parseTransportKeyPair: vi.fn(async () => ({ publicKey: "0x" })),
    parseSignedDecryptionPermit: vi.fn(async () => ({ signature: "0x" })),
  });

  const baseClient = makeBaseClient();
  const decryptClient = {
    ...makeBaseClient(),
    decryptValue: vi.fn(async () => ({ type: "uint64", value: 0n })),
    decryptValues: vi.fn(async () => []),
    decryptValuesFromPairs: vi.fn(async () => []),
    generateTransportKeyPair: vi.fn(async () => ({ publicKey: "0x" })),
  };
  const encryptClient = {
    ...makeBaseClient(),
    encryptValue: vi.fn(async () => ({ encryptedValue: "0x", inputProof: "0x" })),
    encryptValues: vi.fn(async () => ({ encryptedValues: [], inputProof: "0x" })),
  };

  return {
    baseClient,
    decryptClient,
    encryptClient,
    createFhevmBaseClient: vi.fn(() => baseClient),
    createFhevmDecryptClient: vi.fn(() => decryptClient),
    createFhevmEncryptClient: vi.fn(() => encryptClient),
    createFhevmCleartextBaseClient: vi.fn(() => baseClient),
    createFhevmCleartextDecryptClient: vi.fn(() => decryptClient),
    createFhevmCleartextEncryptClient: vi.fn(() => encryptClient),
  };
});

vi.mock("@fhevm/sdk/viem", () => ({
  createFhevmBaseClient: clients.createFhevmBaseClient,
  createFhevmDecryptClient: clients.createFhevmDecryptClient,
  createFhevmEncryptClient: clients.createFhevmEncryptClient,
}));

vi.mock("@fhevm/sdk/viem/cleartext", () => ({
  createFhevmCleartextBaseClient: clients.createFhevmCleartextBaseClient,
  createFhevmCleartextDecryptClient: clients.createFhevmCleartextDecryptClient,
  createFhevmCleartextEncryptClient: clients.createFhevmCleartextEncryptClient,
}));

import { anvil } from "../../chains";
import { FhevmRelayer } from "../fhevm-relayer";

const CONTRACT = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa";
const USER = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB";
const encryptArgs = { contractAddress: CONTRACT, userAddress: USER, values: [] };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FhevmRelayer capability initialization", () => {
  test("public decrypt initializes only the base client", async () => {
    const relayer = new FhevmRelayer({ chain: anvil });
    await relayer.decryptPublicValues({ encryptedValues: [] });

    expect(clients.baseClient.init).toHaveBeenCalledOnce();
    expect(clients.decryptClient.init).not.toHaveBeenCalled();
    expect(clients.encryptClient.init).not.toHaveBeenCalled();
    expect(clients.encryptClient.fetchFheEncryptionKeyBytes).not.toHaveBeenCalled();
  });

  test("private decrypt initializes only the decrypt client", async () => {
    const relayer = new FhevmRelayer({ chain: anvil });
    await relayer.decryptValues({} as never);

    expect(clients.decryptClient.init).toHaveBeenCalledOnce();
    expect(clients.baseClient.init).not.toHaveBeenCalled();
    expect(clients.encryptClient.init).not.toHaveBeenCalled();
    expect(clients.encryptClient.fetchFheEncryptionKeyBytes).not.toHaveBeenCalled();
  });

  test("transport key parsing initializes only the decrypt client", async () => {
    const relayer = new FhevmRelayer({ chain: anvil });
    await relayer.parseTransportKeyPair({ publicKey: "0x", privateKey: "0x" });

    expect(clients.decryptClient.init).toHaveBeenCalledOnce();
    expect(clients.decryptClient.parseTransportKeyPair).toHaveBeenCalledOnce();
    expect(clients.encryptClient.fetchFheEncryptionKeyBytes).not.toHaveBeenCalled();
  });

  test.each([
    {
      auth: { __type: "ApiKeyHeader", value: "secret", header: "x-custom-key" } as const,
      expected: { type: "ApiKeyHeader", value: "secret", header: "x-custom-key" } as const,
    },
    {
      auth: { __type: "ApiKeyCookie", value: "secret", cookie: "custom-cookie" } as const,
      expected: { type: "ApiKeyCookie", value: "secret", cookie: "custom-cookie" } as const,
    },
    {
      auth: { __type: "BearerToken", token: "secret" } as const,
      expected: { type: "BearerToken", token: "secret" } as const,
    },
  ])(
    "translates $auth.__type chain auth before encryption prefetch",
    async ({ auth, expected }) => {
      const relayer = new FhevmRelayer({ chain: { ...anvil, auth } });
      await relayer.encryptValues(encryptArgs);

      expect(clients.encryptClient.fetchFheEncryptionKeyBytes).toHaveBeenCalledWith({
        options: { auth: expected },
      });
      expect(clients.encryptClient.init).toHaveBeenCalledOnce();
      expect(clients.baseClient.init).not.toHaveBeenCalled();
      expect(clients.decryptClient.init).not.toHaveBeenCalled();
    },
  );

  test("prefetches the FHE key before initializing encryption", async () => {
    const relayer = new FhevmRelayer({ chain: anvil });
    await relayer.encryptValues(encryptArgs);

    const [prefetchOrder] =
      clients.encryptClient.fetchFheEncryptionKeyBytes.mock.invocationCallOrder;
    const [initOrder] = clients.encryptClient.init.mock.invocationCallOrder;
    expect(prefetchOrder).toBeLessThan(initOrder as number);
  });

  test("deduplicates the encryption prefetch-and-init across concurrent callers", async () => {
    const relayer = new FhevmRelayer({ chain: anvil });
    await Promise.all([relayer.encryptValues(encryptArgs), relayer.encryptValues(encryptArgs)]);

    // The compound prefetch-then-init is memoized on the relayer, so two
    // concurrent encrypt calls warm the encryption capability exactly once.
    expect(clients.encryptClient.fetchFheEncryptionKeyBytes).toHaveBeenCalledOnce();
    expect(clients.encryptClient.init).toHaveBeenCalledOnce();
  });

  test("serialization does not initialize any capability", () => {
    const relayer = new FhevmRelayer({ chain: anvil });

    expect(relayer.serializeTransportKeyPair({} as never)).toBe("serialized-keypair");
    expect(relayer.serializeSignedDecryptionPermit({} as never)).toBe("serialized-permit");
    expect(clients.baseClient.init).not.toHaveBeenCalled();
    expect(clients.decryptClient.init).not.toHaveBeenCalled();
    expect(clients.encryptClient.init).not.toHaveBeenCalled();
  });

  test.each([
    {
      label: "single public decrypt",
      capability: "base" as const,
      invoke: (relayer: FhevmRelayer) =>
        relayer.decryptPublicValue({ encryptedValue: "0x" } as never),
      delegatedAction: clients.baseClient.decryptPublicValue,
    },
    {
      label: "single private decrypt",
      capability: "decrypt" as const,
      invoke: (relayer: FhevmRelayer) => relayer.decryptValue({} as never),
      delegatedAction: clients.decryptClient.decryptValue,
    },
    {
      label: "cross-contract private decrypt",
      capability: "decrypt" as const,
      invoke: (relayer: FhevmRelayer) => relayer.decryptValuesFromPairs({} as never),
      delegatedAction: clients.decryptClient.decryptValuesFromPairs,
    },
    {
      label: "single encryption",
      capability: "encrypt" as const,
      invoke: (relayer: FhevmRelayer) => relayer.encryptValue({} as never),
      delegatedAction: clients.encryptClient.encryptValue,
    },
    {
      label: "FHE key fetch",
      capability: "encrypt" as const,
      invoke: (relayer: FhevmRelayer) => relayer.fetchFheEncryptionKeyBytes(),
      delegatedAction: clients.encryptClient.fetchFheEncryptionKeyBytes,
    },
    {
      label: "signed permit parsing",
      capability: "base" as const,
      invoke: (relayer: FhevmRelayer) => relayer.parseSignedDecryptionPermit({} as never),
      delegatedAction: clients.baseClient.parseSignedDecryptionPermit,
    },
    {
      label: "transport key generation",
      capability: "decrypt" as const,
      invoke: (relayer: FhevmRelayer) => relayer.generateTransportKeyPair(),
      delegatedAction: clients.decryptClient.generateTransportKeyPair,
    },
  ])(
    "routes $label through only the $capability capability",
    async ({ capability, delegatedAction, invoke }) => {
      const relayer = new FhevmRelayer({ chain: anvil });

      await invoke(relayer);

      expect(delegatedAction).toHaveBeenCalled();
      expect(clients.baseClient.init).toHaveBeenCalledTimes(capability === "base" ? 1 : 0);
      expect(clients.decryptClient.init).toHaveBeenCalledTimes(capability === "decrypt" ? 1 : 0);
      expect(clients.encryptClient.init).toHaveBeenCalledTimes(capability === "encrypt" ? 1 : 0);
    },
  );
});

describe("FhevmRelayer request options", () => {
  test("merges defaults into public decrypt requests", async () => {
    const relayer = new FhevmRelayer({ chain: anvil, options: { timeout: 7_000 } });
    await relayer.decryptPublicValuesWithSignatures({ encryptedValues: [] } as never);

    expect(clients.baseClient.decryptPublicValuesWithSignatures).toHaveBeenCalledWith({
      encryptedValues: [],
      options: { timeout: 7_000 },
    });
  });

  test("lets per-call options override decrypt defaults", async () => {
    const relayer = new FhevmRelayer({ chain: anvil, options: { timeout: 5_000 } });
    await relayer.decryptValues({ options: { fetchRetries: 9, timeout: 42 } } as never);

    expect(clients.decryptClient.decryptValues).toHaveBeenCalledWith({
      options: { fetchRetries: 9, timeout: 42 },
    });
  });

  test("lets per-call options override encrypt defaults", async () => {
    const relayer = new FhevmRelayer({ chain: anvil, options: { timeout: 5_000 } });
    await relayer.encryptValues({ ...encryptArgs, options: { timeout: 10 } });

    expect(clients.encryptClient.encryptValues).toHaveBeenCalledWith({
      ...encryptArgs,
      options: { timeout: 10 },
    });
  });

  test("forwards only client-scoped options to every factory", () => {
    new FhevmRelayer({ chain: anvil, options: { timeout: 5_000, batchRpcCalls: true } });

    for (const factory of [
      clients.createFhevmBaseClient,
      clients.createFhevmDecryptClient,
      clients.createFhevmEncryptClient,
    ]) {
      expect(factory).toHaveBeenCalledWith(
        expect.objectContaining({
          options: { batchRpcCalls: true, moduleVersions: undefined, fheEncryptionKey: undefined },
        }),
      );
    }
  });

  test("signDecryptionPermit forwards parameters without request options", async () => {
    const relayer = new FhevmRelayer({ chain: anvil, options: { timeout: 5_000 } });
    const params = { verifyingContract: CONTRACT } as never;
    await relayer.signDecryptionPermit(params);

    expect(clients.baseClient.signDecryptionPermit).toHaveBeenCalledWith(params);
  });
});

describe("FhevmRelayer client construction", () => {
  test("constructs real capability clients by default", () => {
    new FhevmRelayer({ chain: anvil });

    expect(clients.createFhevmBaseClient).toHaveBeenCalledOnce();
    expect(clients.createFhevmDecryptClient).toHaveBeenCalledOnce();
    expect(clients.createFhevmEncryptClient).toHaveBeenCalledOnce();
    expect(clients.createFhevmCleartextBaseClient).not.toHaveBeenCalled();
  });

  test("constructs cleartext capability clients in cleartext mode", () => {
    new FhevmRelayer({ chain: anvil, cleartext: true });

    expect(clients.createFhevmCleartextBaseClient).toHaveBeenCalledOnce();
    expect(clients.createFhevmCleartextDecryptClient).toHaveBeenCalledOnce();
    expect(clients.createFhevmCleartextEncryptClient).toHaveBeenCalledOnce();
    expect(clients.createFhevmBaseClient).not.toHaveBeenCalled();
  });

  test("exposes the configured chain", () => {
    const relayer = new FhevmRelayer({ chain: anvil });
    expect(relayer.chain).toBe(anvil);
  });
});
