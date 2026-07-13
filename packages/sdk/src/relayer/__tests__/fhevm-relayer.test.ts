import { beforeEach, describe, expect, test, vi } from "vitest";

// Mock the `@fhevm/sdk` client factories so we can observe the options the
// FhevmRelayer merges into each call — and the order it calls them in — without
// any real FHE or network work. Every method the relayer delegates to is a spy.
const { fhevmClient, createFhevmClient, createFhevmCleartextClient } = vi.hoisted(() => {
  const client = {
    init: vi.fn(async () => {}),
    encryptValue: vi.fn(async () => ({ encryptedValue: "0x", inputProof: "0x" })),
    encryptValues: vi.fn(async () => ({ encryptedValues: [], inputProof: "0x" })),
    decryptPublicValue: vi.fn(async () => ({ clearValue: 0n })),
    decryptPublicValues: vi.fn(async () => ({ clearValues: {} })),
    decryptPublicValuesWithSignatures: vi.fn(async () => ({
      clearValues: [],
      checkSignaturesArgs: { handlesList: [], abiEncodedCleartexts: "0x", decryptionProof: "0x" },
    })),
    decryptValue: vi.fn(async () => ({ clearValue: 0n })),
    decryptValues: vi.fn(async () => ({ clearValues: {} })),
    decryptValuesFromPairs: vi.fn(async () => ({ clearValues: {} })),
    fetchFheEncryptionKeyBytes: vi.fn(async () => new Uint8Array()),
    signDecryptionPermit: vi.fn(async () => ({ signature: "0x" })),
    generateTransportKeyPair: vi.fn(async () => ({ publicKey: "0x", privateKey: "0x" })),
    serializeTransportKeyPair: vi.fn(() => "serialized-keypair"),
    serializeSignedDecryptionPermit: vi.fn(() => "serialized-permit"),
    parseTransportKeyPair: vi.fn(() => ({ publicKey: "0x", privateKey: "0x" })),
    parseSignedDecryptionPermit: vi.fn(() => ({ signature: "0x" })),
  };
  return {
    fhevmClient: client,
    createFhevmClient: vi.fn(() => client),
    createFhevmCleartextClient: vi.fn(() => client),
  };
});

vi.mock("@fhevm/sdk/viem", () => ({ createFhevmClient }));
vi.mock("@fhevm/sdk/viem/cleartext", () => ({ createFhevmCleartextClient }));

import { anvil } from "../../chains";
import type { FheChain } from "../../chains/types";
import { FhevmRelayer } from "../fhevm-relayer";

const CONTRACT = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa";
const USER = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB";
// The relayer only passes these through to the mocked client; the exact FHE
// payload shape is irrelevant to the option-merging behaviour under test.
const encryptArgs = { contractAddress: CONTRACT, userAddress: USER, values: [] };

type FhevmClientMock = typeof fhevmClient;
type MethodName = keyof FhevmClientMock;

function clientOptionsFromLastConstruction(): Record<string, unknown> | undefined {
  const args = createFhevmClient.mock.calls.at(-1)?.at(0) as unknown as {
    options?: Record<string, unknown>;
  };
  return args?.options;
}

function optionsFromLast(method: MethodName): Record<string, unknown> | undefined {
  const args = fhevmClient[method].mock.calls.at(-1)?.at(0) as unknown as {
    options?: Record<string, unknown>;
  };
  return args?.options;
}

const optionsFromLastEncrypt = () => optionsFromLast("encryptValues");

beforeEach(() => {
  vi.clearAllMocks();
});

// Methods that go through the relayer/network and therefore both (a) await
// init() first and (b) merge the transport defaults into their `options`.
const OPTION_INJECTING_METHODS = [
  "encryptValue",
  "encryptValues",
  "decryptPublicValue",
  "decryptPublicValues",
  "decryptPublicValuesWithSignatures",
  "decryptValue",
  "decryptValues",
  "decryptValuesFromPairs",
  "fetchFheEncryptionKeyBytes",
] as const satisfies readonly MethodName[];

// Methods that must await init() but carry no relayer `options` to merge.
const INIT_ONLY_METHODS = [
  "signDecryptionPermit",
  "generateTransportKeyPair",
] as const satisfies readonly MethodName[];

// Pure, local passthroughs — no relayer round-trip, so no init() and no
// default-option injection.
const PASSTHROUGH_METHODS = [
  "serializeTransportKeyPair",
  "serializeSignedDecryptionPermit",
  "parseTransportKeyPair",
  "parseSignedDecryptionPermit",
] as const satisfies readonly MethodName[];

const callRelayer = (relayer: FhevmRelayer, method: MethodName) =>
  (relayer as unknown as Record<MethodName, (arg?: unknown) => unknown>)[method]({});

describe("FhevmRelayer request options", () => {
  test("applies the transport-level timeout default to every relayer call", async () => {
    const relayer = new FhevmRelayer({ chain: anvil, options: { timeout: 5_000 } });
    await relayer.encryptValues(encryptArgs);
    expect(optionsFromLastEncrypt()).toMatchObject({ timeout: 5_000 });
  });

  test("lets a per-call timeout override the transport default", async () => {
    const relayer = new FhevmRelayer({ chain: anvil, options: { timeout: 5_000 } });
    await relayer.encryptValues({ ...encryptArgs, options: { timeout: 10 } });
    expect(optionsFromLastEncrypt()).toMatchObject({ timeout: 10 });
  });

  test("applies the transport timeout on the public-decrypt path too", async () => {
    const relayer = new FhevmRelayer({ chain: anvil, options: { timeout: 7_000 } });
    await relayer.decryptPublicValuesWithSignatures({ encryptedValues: [] } as never);
    expect(optionsFromLast("decryptPublicValuesWithSignatures")).toMatchObject({ timeout: 7_000 });
  });

  test("does not leak timeout into the @fhevm/sdk client options", () => {
    new FhevmRelayer({ chain: anvil, options: { timeout: 5_000, batchRpcCalls: true } });
    const clientOptions = clientOptionsFromLastConstruction();
    expect(clientOptions).toMatchObject({ batchRpcCalls: true });
    expect(clientOptions).not.toHaveProperty("timeout");
  });

  test("carries no timeout in the defaults when none is configured", async () => {
    const relayer = new FhevmRelayer({ chain: anvil });
    await relayer.encryptValues(encryptArgs);
    const options = optionsFromLastEncrypt();
    expect(options).toBeDefined();
    expect(options?.timeout).toBeUndefined();
  });

  test("merges the transport defaults into every option-carrying method", async () => {
    const relayer = new FhevmRelayer({ chain: anvil, options: { timeout: 3_000 } });
    for (const method of OPTION_INJECTING_METHODS) {
      await callRelayer(relayer, method);
      expect(optionsFromLast(method), `${method} should merge defaults`).toMatchObject({
        timeout: 3_000,
      });
    }
  });

  test("a per-call option overrides the default on the merge, not the reverse", async () => {
    const relayer = new FhevmRelayer({ chain: anvil, options: { timeout: 5_000 } });
    // timeout is a transport default (5_000); a per-call value (42) must win.
    await relayer.decryptValues({ options: { fetchRetries: 9, timeout: 42 } } as never);
    expect(optionsFromLast("decryptValues")).toMatchObject({ fetchRetries: 9, timeout: 42 });
  });

  test("does not overwrite runtime auth when the chain has no auth", async () => {
    const relayer = new FhevmRelayer({ chain: anvil });
    await relayer.encryptValues(encryptArgs);
    expect(optionsFromLastEncrypt()).not.toHaveProperty("auth");
  });

  test("lets per-call auth override the chain auth", async () => {
    const chainAuth = { type: "ApiKeyHeader", value: "chain-secret" } as const;
    const callAuth = { type: "BearerToken", token: "call-secret" } as const;
    const relayer = new FhevmRelayer({ chain: { ...anvil, auth: chainAuth } });
    await relayer.encryptValues({ ...encryptArgs, options: { auth: callAuth } });
    expect(optionsFromLastEncrypt()).toMatchObject({ auth: callAuth });
  });
});

describe("FhevmRelayer init lifecycle", () => {
  test("init() delegates to the underlying @fhevm/sdk client", async () => {
    const relayer = new FhevmRelayer({ chain: anvil });
    await relayer.init();
    expect(fhevmClient.init).toHaveBeenCalledTimes(1);
  });

  test("prefetches the FHE key with chain auth before client init", async () => {
    const auth = { type: "ApiKeyHeader", value: "secret" } as const;
    const relayer = new FhevmRelayer({ chain: { ...anvil, auth } });
    await relayer.init();

    expect(fhevmClient.fetchFheEncryptionKeyBytes).toHaveBeenCalledWith({ options: { auth } });
    const [prefetchOrder] = fhevmClient.fetchFheEncryptionKeyBytes.mock.invocationCallOrder;
    const [initOrder] = fhevmClient.init.mock.invocationCallOrder;
    expect(prefetchOrder).toBeDefined();
    expect(initOrder).toBeDefined();
    expect(prefetchOrder).toBeLessThan(initOrder as number);
  });

  test("shares one combined initialization attempt across concurrent callers", async () => {
    const relayer = new FhevmRelayer({ chain: anvil });
    await Promise.all([relayer.init(), relayer.init()]);
    expect(fhevmClient.fetchFheEncryptionKeyBytes).toHaveBeenCalledTimes(1);
    expect(fhevmClient.init).toHaveBeenCalledTimes(1);
  });

  test.each([...OPTION_INJECTING_METHODS, ...INIT_ONLY_METHODS])(
    "%s awaits init() before delegating to the client",
    async (method) => {
      const relayer = new FhevmRelayer({ chain: anvil });
      await callRelayer(relayer, method);

      expect(fhevmClient.init, `${method} must init the client`).toHaveBeenCalledTimes(1);
      const [initOrder] = fhevmClient.init.mock.invocationCallOrder;
      const callOrder = fhevmClient[method].mock.invocationCallOrder.at(-1);
      expect(initOrder).toBeDefined();
      expect(callOrder).toBeDefined();
      expect(initOrder, `${method} must init() before the relayer round-trip`).toBeLessThan(
        callOrder as number,
      );
    },
  );

  test.each(PASSTHROUGH_METHODS)("%s does not init the client", (method) => {
    const relayer = new FhevmRelayer({ chain: anvil });
    callRelayer(relayer, method);
    expect(fhevmClient.init, `${method} is local-only`).not.toHaveBeenCalled();
    expect(fhevmClient[method]).toHaveBeenCalledTimes(1);
  });
});

describe("FhevmRelayer non-network passthroughs", () => {
  test.each(PASSTHROUGH_METHODS)("%s forwards args verbatim without merging options", (method) => {
    // A transport timeout is configured but must never reach a local passthrough.
    const relayer = new FhevmRelayer({ chain: anvil, options: { timeout: 5_000 } });
    const arg = { some: "payload" };
    (relayer as unknown as Record<MethodName, (a: unknown) => unknown>)[method](arg);
    expect(fhevmClient[method]).toHaveBeenCalledWith(arg);
  });

  test("passthrough return values are surfaced to the caller", () => {
    const relayer = new FhevmRelayer({ chain: anvil });
    expect(relayer.serializeTransportKeyPair({} as never)).toBe("serialized-keypair");
    expect(relayer.serializeSignedDecryptionPermit({} as never)).toBe("serialized-permit");
  });
});

describe("FhevmRelayer signDecryptionPermit", () => {
  test("forwards parameters verbatim without injecting relayer options", async () => {
    const relayer = new FhevmRelayer({ chain: anvil, options: { timeout: 5_000 } });
    const params = { verifyingContract: CONTRACT } as never;
    await relayer.signDecryptionPermit(params);
    expect(fhevmClient.signDecryptionPermit).toHaveBeenCalledWith(params);
    // No `options` bag is ever added on this path.
    expect(optionsFromLast("signDecryptionPermit")).toBeUndefined();
  });
});

describe("FhevmRelayer client construction", () => {
  test("routes to the real relayer client by default", () => {
    new FhevmRelayer({ chain: anvil });
    expect(createFhevmClient).toHaveBeenCalledTimes(1);
    expect(createFhevmCleartextClient).not.toHaveBeenCalled();
  });

  test("routes to the cleartext client when cleartext is enabled", () => {
    new FhevmRelayer({ chain: anvil, cleartext: true });
    expect(createFhevmCleartextClient).toHaveBeenCalledTimes(1);
    expect(createFhevmClient).not.toHaveBeenCalled();
  });

  test("exposes the configured chain via the getter", () => {
    const relayer = new FhevmRelayer({ chain: anvil });
    expect(relayer.chain).toBe(anvil);
  });

  test("injects the chain's auth into the transport defaults", async () => {
    const auth = { type: "ApiKeyHeader", value: "secret" };
    const chain = { ...anvil, auth } as unknown as FheChain;
    const relayer = new FhevmRelayer({ chain });
    await relayer.encryptValues(encryptArgs);
    expect(optionsFromLastEncrypt()).toMatchObject({ auth });
  });

  test("forwards only client-scoped options to the factory", () => {
    new FhevmRelayer({ chain: anvil, options: { timeout: 5_000, batchRpcCalls: true } });
    const clientOptions = clientOptionsFromLastConstruction();
    // Client options carry batchRpcCalls/moduleVersions/fheEncryptionKey only —
    // never the request-level `timeout` (asserted above) or `auth`.
    expect(clientOptions).toMatchObject({ batchRpcCalls: true });
    expect(clientOptions).not.toHaveProperty("auth");
  });
});
