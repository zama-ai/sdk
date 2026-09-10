import { storage, fixture, decode as values, testServer } from "./support/harness.js";
import { randomUUID } from "node:crypto";

import type { ServiceError } from "@grpc/grpc-js";
import { anvil, BaseSigner, type Address, type Hex } from "@zama-fhe/sdk";
import { bytesToHex, hexToBytes } from "viem";
import { expect, test, vi } from "vitest";

import {
  TOKEN,
  TEST_SIGNATURE,
  VALID_ENCRYPTED_VALUE,
} from "../../sdk/src/test-fixtures/constants.js";

import { errorDetails } from "../src/errors.js";

const A: Address = "0x1111111111111111111111111111111111111111";
const B: Address = "0x2222222222222222222222222222222222222222";
const C: Address = "0x3333333333333333333333333333333333333333";
const inputs = [{ encryptedValue: VALID_ENCRYPTED_VALUE, contractAddress: TOKEN }];
const bytes = (value: Hex) => Buffer.from(hexToBytes(value));
class Signer extends BaseSigner {
  readonly signatures: Address[] = [];
  constructor(address: Address) {
    super({ address, chainId: anvil.id });
  }
  override async signTypedData(): Promise<Hex> {
    this.signatures.push(this.requireWalletAccount("signTypedData").address);
    return TEST_SIGNATURE;
  }
  override async writeContract(): Promise<Hex> {
    throw new Error("Unexpected transaction");
  }
}
async function harness() {
  const backing = storage();
  const fixtures: ReturnType<typeof fixture>[] = [];
  const server = await testServer(async (_, signer) => {
    const created = fixture(signer, backing);
    fixtures.push(created);
    return { sdk: created.sdk, storageIdentities: ["shared-fixture"] };
  });
  const { client } = server;
  return {
    async open(address: Address, attach = true) {
      const contextId = await new Promise<string>((resolve, reject) =>
        client.createContext(
          {
            storage: undefined,
            permitStorage: undefined,
            configJson: "{}",
            signerEnabled: true,
            account: { address: bytes(address), chainId: BigInt(anvil.id) },
          },
          (error, result) => (error ? reject(error) : resolve(result.contextId)),
        ),
      );
      const created = fixtures.at(-1);
      if (!created) {
        throw new Error("Missing SDK fixture");
      }
      const signatures: string[] = [];
      if (attach) {
        await server.attachSigner(contextId, async (action) => {
          signatures.push(bytesToHex(action.account!.address));
          return TEST_SIGNATURE;
        });
      }
      const operation = () => ({ contextId, operationId: randomUUID() });
      const encodedInputs = inputs.map((input) => ({
        encryptedValue: bytes(input.encryptedValue),
        contractAddress: bytes(input.contractAddress),
      }));
      return {
        ...created,
        signatures,
        decrypt: () =>
          new Promise<ReturnType<typeof values>>((resolve, reject) =>
            client.decryptValues(
              { operation: operation(), inputs: encodedInputs, timeoutMs: undefined },
              (error, result) => (error ? reject(error) : resolve(values(result.values))),
            ),
          ),
        hasPermit: () =>
          new Promise<boolean>((resolve, reject) =>
            client.hasPermit(
              { operation: operation(), contractAddresses: [bytes(TOKEN)] },
              (error, result) => (error ? reject(error) : resolve(result.hasPermit)),
            ),
          ),
        update: (next?: Address) =>
          new Promise<void>((resolve, reject) =>
            client.updateAccount(
              {
                contextId,
                account:
                  next === undefined
                    ? undefined
                    : { address: bytes(next), chainId: BigInt(anvil.id) },
              },
              (error) => (error ? reject(error) : resolve()),
            ),
          ),
        delegated: (delegator: Address, account?: Address) =>
          new Promise<ReturnType<typeof values>>((resolve, reject) =>
            client.delegatedDecryptValues(
              {
                operation: operation(),
                inputs: encodedInputs,
                delegatorAddress: bytes(delegator),
                accountAddress: account === undefined ? undefined : bytes(account),
                waitForPropagation: false,
              },
              (error, result) => (error ? reject(error) : resolve(values(result.values))),
            ),
          ),
      };
    },
    close: server.close,
  };
}

test("multiple SDK contexts isolate signer identity and preserve account-change credential cleanup", async () => {
  const backing = storage();
  const signerA = new Signer(A);
  const signerB = new Signer(B);
  const observerSigner = new Signer(A);
  const directA = fixture(signerA, backing);
  const directB = fixture(signerB, backing);
  const observer = fixture(observerSigner, backing);
  const remote = await harness();
  try {
    const remoteA = await remote.open(A);
    const remoteB = await remote.open(B);
    const remoteObserver = await remote.open(A, false);
    const expected = await Promise.all([
      directA.sdk.decryption.decryptValues(inputs),
      directB.sdk.decryption.decryptValues(inputs),
    ]);
    expect(await Promise.all([remoteA.decrypt(), remoteB.decrypt()])).toEqual(expected);
    expect(remoteA.signatures).toEqual(signerA.signatures);
    expect(remoteB.signatures).toEqual(signerB.signatures);
    expect(await remoteObserver.hasPermit()).toBe(await observer.sdk.permits.hasPermit([TOKEN]));
    expect(await remoteObserver.hasPermit()).toBe(true);

    signerA.walletAccount.setSnapshot({ address: C, chainId: anvil.id });
    await remoteA.update(C);
    await expect.poll(() => observer.sdk.permits.hasPermit([TOKEN])).toBe(false);
    await expect.poll(() => remoteObserver.hasPermit()).toBe(false);
    expect(await remoteA.decrypt()).toEqual(await directA.sdk.decryption.decryptValues(inputs));
    expect(await remoteB.decrypt()).toEqual(await directB.sdk.decryption.decryptValues(inputs));
    expect(remoteA.signatures).toEqual(signerA.signatures);
    expect(remoteA.signatures).toEqual([A, C]);
    expect(remoteB.signatures).toEqual(signerB.signatures);
    expect(remoteB.signatures).toEqual([B]);

    signerA.walletAccount.setSnapshot(undefined);
    await remoteA.update();
    const directError = await directA.sdk.decryption
      .decryptValues(inputs)
      .catch((error: unknown) => errorDetails(error));
    const remoteError = await remoteA
      .decrypt()
      .catch((error: ServiceError) => error.metadata.get("zama-error-code")[0]);
    expect(remoteError).toBe((directError as { code: string }).code);
    expect(remoteError).toBe("WALLET_NOT_CONNECTED");
    expect(await remoteB.decrypt()).toEqual(await directB.sdk.decryption.decryptValues(inputs));
    expect(remoteB.signatures).toEqual([B]);
  } finally {
    directA.sdk.dispose();
    directB.sdk.dispose();
    observer.sdk.dispose();
    signerA.dispose();
    signerB.dispose();
    observerSigner.dispose();
    await remote.close();
  }
});

test("delegated requester defaults and explicit accounts match canonical SDK cache separation", async () => {
  const signer = new Signer(A);
  const direct = fixture(signer, storage());
  const remote = await harness();
  try {
    const context = await remote.open(A);
    vi.mocked(direct.provider.readContract).mockResolvedValue((1n << 64n) - 1n);
    vi.mocked(context.provider.readContract).mockResolvedValue((1n << 64n) - 1n);
    for (const requester of [undefined, C, undefined]) {
      const expected = await direct.sdk.decryption.delegatedDecryptValues(inputs, B, requester, {
        waitForPropagation: false,
      });
      expect(await context.delegated(B, requester)).toEqual(expected);
    }
    expect(context.relayer.decryptValues).toHaveBeenCalledTimes(2);
    expect(direct.relayer.decryptValues).toHaveBeenCalledTimes(2);
    expect(context.signatures).toEqual(signer.signatures);
    expect(context.signatures).toEqual([A]);
  } finally {
    direct.sdk.dispose();
    signer.dispose();
    await remote.close();
  }
});
