import { Metadata, type ServiceError } from "@grpc/grpc-js";
import { randomUUID } from "node:crypto";
import {
  anvil,
  BaseSigner,
  ChainMismatchError,
  delegateForUserDecryptionContract,
  DelegationCooldownError,
  DelegationDelegateEqualsContractError,
  DelegationExpirationTooSoonError,
  DelegationExpiryUnchangedError,
  DelegationNotFoundError,
  DelegationSelfNotAllowedError,
  revokeDelegationContract,
  SignerNotConfiguredError,
  SigningRejectedError,
  TransactionRevertedError,
  ZamaError,
  type Hex,
  type RawLog,
  type WriteContractConfig,
} from "@zama-fhe/sdk";
import {
  bytesToHex,
  encodeErrorResult,
  encodeFunctionData,
  parseAbi,
  toFunctionSelector,
} from "viem";
import { expect, test, vi } from "vitest";

import { DELEGATE, DELEGATOR, TOKEN, USER } from "../../sdk/src/test-fixtures/constants.js";
import { matchAclRevert } from "../../sdk/src/errors/acl-revert.js";
import { createContext, fixture, storage, testServer } from "./support/harness.js";
import { FakeStream } from "./support/fake-stream.js";
import { frames } from "./support/frames.js";
import { bytes, json } from "../src/encoding.js";
import { errorDetails } from "../src/errors.js";
import { createCoordinator } from "../src/coordination.js";
import { DaemonRuntime } from "../src/runtime.js";
import type { EventStream } from "../src/remote-events.js";
import { operationContext, RemoteSigner, type SignerStream } from "../src/remote-signer.js";
import type * as rpc from "../src/generated/zama/sdk/v1beta1/daemon.js";

const MAX_UINT64 = 2n ** 64n - 1n;
const ACL = anvil.aclContractAddress;
const HASH = `0x${"ab".repeat(32)}` as Hex;
const account = { address: USER, chainId: anvil.id };
// ACL.sol declares this revert; the SDK aclAbi carries no error entries, so only tests decode it.
const COOLDOWN_ABI = parseAbi([
  "error AlreadyDelegatedOrRevokedInSameBlock(address delegator, address delegate, address contractAddress, uint256 blockNumber)",
]);
const COOLDOWN_SELECTOR = toFunctionSelector(
  "AlreadyDelegatedOrRevokedInSameBlock(address,address,address,uint256)",
);
const COOLDOWN_DATA = encodeErrorResult({
  abi: COOLDOWN_ABI,
  errorName: "AlreadyDelegatedOrRevokedInSameBlock",
  args: [USER, DELEGATE, TOKEN, 0x1234n],
});
const cooldownRevert = (): rpc.SignerReply["result"] => ({
  $case: "executionRevert",
  executionRevert: {
    data: Buffer.from(COOLDOWN_DATA.slice(2), "hex"),
    message: "execution reverted",
  },
});

const logs: RawLog[] = [
  { address: TOKEN, topics: [`0x${"11".repeat(32)}`, `0x${"22".repeat(32)}`], data: "0x1234" },
  { topics: [], data: "0x" },
];

class DirectSigner extends BaseSigner {
  write = vi.fn(async (_config: unknown) => HASH);
  constructor() {
    super(account);
  }
  async signTypedData() {
    return "0x01" as Hex;
  }
  writeContract = this.write;
}

function errorCode(error: unknown): string | undefined {
  const metadata = (error as ServiceError).metadata;
  const trailer = metadata?.get("zama-error-code")[0]?.toString();
  if (trailer) {
    return trailer;
  }
  return error instanceof ZamaError ? error.code : undefined;
}

async function setup(signerEnabled = true) {
  const directSigner = new DirectSigner();
  const direct = fixture(signerEnabled ? directSigner : undefined);
  const fixtures: ReturnType<typeof fixture>[] = [];
  const server = await testServer(async (_, signer) => {
    const value = fixture(signer, storage());
    fixtures.push(value);
    return { sdk: value.sdk, storageIdentities: ["delegation-equivalence"] };
  });
  const contextId = await createContext(server.client, {
    signerEnabled,
    account: signerEnabled ? { address: bytes(USER), chainId: BigInt(anvil.id) } : undefined,
  });
  const writes: rpc.ContractWriteRequest[] = [];
  const wallet: { sign: () => Promise<Hex>; reply?: () => rpc.SignerReply["result"] } = {
    sign: async () => HASH,
  };
  if (signerEnabled) {
    await server.attachWallet(contextId, async (action) => {
      if (action.request?.$case !== "contractWrite") {
        return { $case: "error", error: errorDetails(new Error("Unexpected signer action")) };
      }
      writes.push(action.request.contractWrite);
      return (
        wallet.reply?.() ??
        wallet.sign().then(
          (hash): rpc.SignerReply["result"] => ({
            $case: "transactionHash",
            transactionHash: bytes(hash),
          }),
          (error: unknown): rpc.SignerReply["result"] => ({
            $case: "error",
            error: errorDetails(error),
          }),
        )
      );
    });
  }
  const remote = () => fixtures[0]!;
  return {
    client: server.client,
    direct,
    directSigner,
    writes,
    wallet,
    remote,
    operation: () => ({ contextId, operationId: randomUUID() }),
    providers: () => [direct.provider, remote().provider] as const,
    async close() {
      direct.sdk.dispose();
      directSigner.dispose();
      await server.close();
    },
  };
}
type Env = Awaited<ReturnType<typeof setup>>;

function expiry(env: Env, value: bigint) {
  for (const provider of env.providers()) {
    vi.mocked(provider.readContract).mockResolvedValue(value as never);
  }
}
function receipt(env: Env, value: RawLog[] = []) {
  for (const provider of env.providers()) {
    vi.mocked(provider.waitForTransactionReceipt).mockResolvedValue({ logs: value });
  }
}
function blockTimestamp(env: Env, value: bigint) {
  for (const provider of env.providers()) {
    vi.mocked(provider.getBlockTimestamp).mockResolvedValue(value);
  }
}

type UnaryCall<Request, Response> = (
  request: Request,
  metadata: Metadata,
  callback: (error: ServiceError | null, response: Response) => void,
) => unknown;

function unary<Request, Response>(fn: UnaryCall<Request, Response>, request: Request) {
  return new Promise<Response>((resolve, reject) =>
    fn(request, new Metadata(), (error, value) => (error ? reject(error) : resolve(value))),
  );
}
const grant = (env: Env, delegation: rpc.DelegateDecryption) =>
  unary<rpc.DelegateDecryptionRequest, rpc.DelegateDecryptionResponse>(
    (request, metadata, callback) => env.client.delegateDecryption(request, metadata, callback),
    { operation: env.operation(), delegation },
  );
const revoke = (env: Env, delegation: rpc.RevokeDelegation | undefined) =>
  unary<rpc.RevokeDelegationRequest, rpc.RevokeDelegationResponse>(
    (request, metadata, callback) => env.client.revokeDelegation(request, metadata, callback),
    { operation: env.operation(), delegation },
  );
const query = (env: Env, contract = TOKEN, delegator = USER, delegate = DELEGATE) => ({
  operation: env.operation(),
  contractAddress: bytes(contract),
  delegatorAddress: bytes(delegator),
  delegateAddress: bytes(delegate),
});
const isActive = (env: Env, request: rpc.DelegationQueryRequest) =>
  unary<rpc.DelegationQueryRequest, rpc.IsDelegationActiveResponse>(
    (req, metadata, callback) => env.client.isDelegationActive(req, metadata, callback),
    request,
  );
const getExpiry = (env: Env, request: rpc.DelegationQueryRequest) =>
  unary<rpc.DelegationQueryRequest, rpc.GetDelegationExpiryResponse>(
    (req, metadata, callback) => env.client.getDelegationExpiry(req, metadata, callback),
    request,
  );
const getStatus = (env: Env, request: rpc.DelegationQueryRequest) =>
  unary<rpc.DelegationQueryRequest, rpc.GetDelegationStatusResponse>(
    (req, metadata, callback) => env.client.getDelegationStatus(req, metadata, callback),
    request,
  );
const failure = <T>(promise: Promise<T>) =>
  promise.then(
    () => undefined,
    (error: unknown) => error,
  );

function expectedWrite(config: WriteContractConfig) {
  return {
    address: bytes(config.address),
    data: bytes(encodeFunctionData(config)),
    abiJson: json(config.abi),
    functionName: config.functionName,
    argsJson: json(config.args),
  };
}
const expectedTransactionWithLogs: rpc.TransactionResult = {
  transactionHash: Buffer.from(HASH.slice(2), "hex"),
  logs: [
    {
      address: Buffer.from(TOKEN.slice(2), "hex"),
      topics: [Buffer.from("11".repeat(32), "hex"), Buffer.from("22".repeat(32), "hex")],
      data: Buffer.from("1234", "hex"),
    },
    { topics: [], data: Buffer.alloc(0) },
  ],
};
const expectedEmptyTransaction: rpc.TransactionResult = {
  transactionHash: Buffer.from(HASH.slice(2), "hex"),
  logs: [],
};

test("granting without an expiry delegates permanently and round-trips the receipt logs", async () => {
  const env = await setup();
  try {
    expiry(env, 0n);
    receipt(env, logs);
    const expected = await env.direct.sdk.delegations.delegateDecryption({
      contractAddress: TOKEN,
      delegateAddress: DELEGATE,
    });
    const actual = await grant(env, {
      contractAddress: bytes(TOKEN),
      delegateAddress: bytes(DELEGATE),
      expirationDateMs: undefined,
    });
    expect(expected.txHash).toBe(HASH);
    expect(actual.transaction).toEqual(expectedTransactionWithLogs);
    expect(actual.transaction?.logs.map((log) => log.address)).toEqual([bytes(TOKEN), undefined]);
    const config = env.directSigner.write.mock.calls[0]![0] as WriteContractConfig;
    expect(config.args).toEqual([DELEGATE, TOKEN, MAX_UINT64]);
    expect(env.writes).toHaveLength(1);
    expect(env.writes[0]).toMatchObject(
      expectedWrite(delegateForUserDecryptionContract(ACL, DELEGATE, TOKEN, MAX_UINT64)),
    );
    expect(bytesToHex(env.writes[0]!.address)).toBe(ACL.toLowerCase());
    expect(env.writes[0]!.functionName).toBe("delegateForUserDecryption");
  } finally {
    await env.close();
  }
});

test("granting with an explicit expiry forwards the whole-second deadline", async () => {
  const env = await setup();
  try {
    expiry(env, 0n);
    receipt(env);
    const expirationDateMs = Date.now() + 86_400_000;
    const seconds = BigInt(Math.floor(expirationDateMs / 1000));
    const expected = await env.direct.sdk.delegations.delegateDecryption({
      contractAddress: TOKEN,
      delegateAddress: DELEGATE,
      expirationDate: new Date(expirationDateMs),
    });
    const actual = await grant(env, {
      contractAddress: bytes(TOKEN),
      delegateAddress: bytes(DELEGATE),
      expirationDateMs: BigInt(expirationDateMs),
    });
    expect(expected.txHash).toBe(HASH);
    expect(actual.transaction).toEqual(expectedEmptyTransaction);
    expect((env.directSigner.write.mock.calls[0]![0] as WriteContractConfig).args).toEqual([
      DELEGATE,
      TOKEN,
      seconds,
    ]);
    expect(env.writes[0]).toMatchObject(
      expectedWrite(delegateForUserDecryptionContract(ACL, DELEGATE, TOKEN, seconds)),
    );
  } finally {
    await env.close();
  }
});

test("granting rejects an expiry one millisecond past the largest representable Date", async () => {
  const env = await setup();
  try {
    const error = await failure(
      grant(env, {
        contractAddress: bytes(TOKEN),
        delegateAddress: bytes(DELEGATE),
        expirationDateMs: 8_640_000_000_000_001n,
      }),
    );
    expect(errorCode(error)).toBe("INVALID_ARGUMENT");
    expect((error as ServiceError).details).toBe(
      "Expiration date is outside the representable range.",
    );
    expect(env.writes).toEqual([]);
  } finally {
    await env.close();
  }
});

const grantFailures = [
  {
    name: "an expiry less than an hour away",
    error: DelegationExpirationTooSoonError,
    code: "DELEGATION_EXPIRATION_TOO_SOON",
    current: 0n,
    contract: TOKEN,
    delegate: DELEGATE,
    expirationDateMs: () => Date.now() + 60_000,
  },
  {
    name: "a self delegation",
    error: DelegationSelfNotAllowedError,
    code: "DELEGATION_SELF_NOT_ALLOWED",
    current: 0n,
    contract: TOKEN,
    delegate: USER,
    expirationDateMs: () => undefined,
  },
  {
    name: "a delegate equal to the contract",
    error: DelegationDelegateEqualsContractError,
    code: "DELEGATION_DELEGATE_EQUALS_CONTRACT",
    current: 0n,
    contract: TOKEN,
    delegate: TOKEN,
    expirationDateMs: () => undefined,
  },
  {
    name: "an unchanged expiry",
    error: DelegationExpiryUnchangedError,
    code: "DELEGATION_EXPIRY_UNCHANGED",
    current: MAX_UINT64,
    contract: TOKEN,
    delegate: DELEGATE,
    expirationDateMs: () => undefined,
  },
] as const;

test.each(grantFailures)("granting rejects $name identically", async (item) => {
  const env = await setup();
  try {
    expiry(env, item.current);
    const expirationDateMs = item.expirationDateMs();
    const directError = await failure(
      env.direct.sdk.delegations.delegateDecryption({
        contractAddress: item.contract,
        delegateAddress: item.delegate,
        ...(expirationDateMs === undefined ? {} : { expirationDate: new Date(expirationDateMs) }),
      }),
    );
    const remoteError = await failure(
      grant(env, {
        contractAddress: bytes(item.contract),
        delegateAddress: bytes(item.delegate),
        ...(expirationDateMs === undefined ? {} : { expirationDateMs: BigInt(expirationDateMs) }),
      }),
    );
    expect(directError).toBeInstanceOf(item.error);
    expect(errorCode(directError)).toBe(item.code);
    expect(errorCode(remoteError)).toBe(item.code);
    expect(env.directSigner.write).not.toHaveBeenCalled();
    expect(env.writes).toEqual([]);
  } finally {
    await env.close();
  }
});

test("revoking an existing delegation calls the ACL revoke function", async () => {
  const env = await setup();
  try {
    expiry(env, MAX_UINT64);
    receipt(env, logs);
    const expected = await env.direct.sdk.delegations.revokeDelegation({
      contractAddress: TOKEN,
      delegateAddress: DELEGATE,
    });
    const actual = await revoke(env, {
      contractAddress: bytes(TOKEN),
      delegateAddress: bytes(DELEGATE),
    });
    expect(expected.txHash).toBe(HASH);
    expect(actual.transaction).toEqual(expectedTransactionWithLogs);
    expect(env.writes[0]).toMatchObject(
      expectedWrite(revokeDelegationContract(ACL, DELEGATE, TOKEN)),
    );
    expect(env.writes[0]!.functionName).toBe("revokeDelegationForUserDecryption");
    expect((env.directSigner.write.mock.calls[0]![0] as WriteContractConfig).args).toEqual([
      DELEGATE,
      TOKEN,
    ]);
  } finally {
    await env.close();
  }
});

test("revoking a missing delegation reports DELEGATION_NOT_FOUND on both sides", async () => {
  const env = await setup();
  try {
    expiry(env, 0n);
    const directError = await failure(
      env.direct.sdk.delegations.revokeDelegation({
        contractAddress: TOKEN,
        delegateAddress: DELEGATE,
      }),
    );
    const remoteError = await failure(
      revoke(env, { contractAddress: bytes(TOKEN), delegateAddress: bytes(DELEGATE) }),
    );
    expect(directError).toBeInstanceOf(DelegationNotFoundError);
    expect(errorCode(remoteError)).toBe(errorCode(directError));
    expect(errorCode(remoteError)).toBe("DELEGATION_NOT_FOUND");
    expect(env.writes).toEqual([]);
  } finally {
    await env.close();
  }
});

const now = 1_800_000_000n;
const reads = [
  { name: "missing", stored: 0n, active: false },
  { name: "expired", stored: now - 1n, active: false },
  { name: "active", stored: now + 3_600n, active: true },
  { name: "permanent", stored: MAX_UINT64, active: true },
] as const;

test.each(reads)("delegation reads match the SDK for a $name delegation", async (item) => {
  const env = await setup();
  try {
    expiry(env, item.stored);
    blockTimestamp(env, now);
    const request = query(env, TOKEN, DELEGATOR, DELEGATE);
    const params = {
      contractAddress: TOKEN,
      delegatorAddress: DELEGATOR,
      delegateAddress: DELEGATE,
    };
    const expected = {
      isActive: await env.direct.sdk.delegations.isActive(params),
      expiryTimestamp: await env.direct.sdk.delegations.getExpiry(params),
      status: await env.direct.sdk.delegations.getStatus(params),
    };
    expect(expected).toEqual({
      isActive: item.active,
      expiryTimestamp: item.stored,
      status: { isActive: item.active, expiryTimestamp: item.stored },
    });
    expect(await isActive(env, request)).toEqual({ isActive: expected.isActive });
    expect(await getExpiry(env, request)).toEqual({ expiryTimestamp: expected.expiryTimestamp });
    expect(await getStatus(env, request)).toEqual(expected.status);
    expect(env.writes).toEqual([]);
  } finally {
    await env.close();
  }
});

test("reads work without a signer while writes report SIGNER_NOT_CONFIGURED", async () => {
  const env = await setup(false);
  try {
    expiry(env, MAX_UINT64);
    const request = query(env, TOKEN, DELEGATOR, DELEGATE);
    expect(await isActive(env, request)).toEqual({ isActive: true });
    expect(await getExpiry(env, request)).toEqual({ expiryTimestamp: MAX_UINT64 });
    expect(await getStatus(env, request)).toEqual({ isActive: true, expiryTimestamp: MAX_UINT64 });
    const directError = await failure(
      env.direct.sdk.delegations.delegateDecryption({
        contractAddress: TOKEN,
        delegateAddress: DELEGATE,
      }),
    );
    expect(directError).toBeInstanceOf(SignerNotConfiguredError);
    const grantError = await failure(
      grant(env, {
        contractAddress: bytes(TOKEN),
        delegateAddress: bytes(DELEGATE),
        expirationDateMs: undefined,
      }),
    );
    const revokeError = await failure(
      revoke(env, { contractAddress: bytes(TOKEN), delegateAddress: bytes(DELEGATE) }),
    );
    expect([errorCode(grantError), errorCode(revokeError)]).toEqual([
      "SIGNER_NOT_CONFIGURED",
      "SIGNER_NOT_CONFIGURED",
    ]);
  } finally {
    await env.close();
  }
});

test("a chain mismatch between the account and the provider fails identically", async () => {
  const env = await setup();
  try {
    expiry(env, 0n);
    for (const provider of env.providers()) {
      vi.mocked(provider.getChainId).mockResolvedValue(1);
    }
    const directError = await failure(
      env.direct.sdk.delegations.delegateDecryption({
        contractAddress: TOKEN,
        delegateAddress: DELEGATE,
      }),
    );
    const remoteError = await failure(
      grant(env, {
        contractAddress: bytes(TOKEN),
        delegateAddress: bytes(DELEGATE),
        expirationDateMs: undefined,
      }),
    );
    expect(directError).toBeInstanceOf(ChainMismatchError);
    expect(errorCode(directError)).toBe("CHAIN_MISMATCH");
    expect(errorCode(remoteError)).toBe("CHAIN_MISMATCH");
    expect(env.writes).toEqual([]);
  } finally {
    await env.close();
  }
});

test("a wallet rejection reaches the caller with the SDK signing code", async () => {
  const env = await setup();
  try {
    expiry(env, 0n);
    const rejection = new SigningRejectedError("Wallet declined");
    env.directSigner.write.mockRejectedValue(rejection);
    env.wallet.sign = () => Promise.reject(rejection);
    const directError = await failure(
      env.direct.sdk.delegations.delegateDecryption({
        contractAddress: TOKEN,
        delegateAddress: DELEGATE,
      }),
    );
    const remoteError = await failure(
      grant(env, {
        contractAddress: bytes(TOKEN),
        delegateAddress: bytes(DELEGATE),
        expirationDateMs: undefined,
      }),
    );
    expect(directError).toBeInstanceOf(SigningRejectedError);
    expect(errorCode(remoteError)).toBe(errorCode(directError));
    expect(errorCode(remoteError)).toBe("SIGNING_REJECTED");
    expect(env.writes).toHaveLength(1);
    expect(env.remote().provider.waitForTransactionReceipt).not.toHaveBeenCalled();
  } finally {
    await env.close();
  }
});

test("a failing receipt wait reports TRANSACTION_REVERTED on both sides", async () => {
  const env = await setup();
  try {
    expiry(env, 0n);
    const rejection = new Error("RPC execution reverted");
    for (const provider of env.providers()) {
      vi.mocked(provider.waitForTransactionReceipt).mockRejectedValue(rejection);
    }
    const directError = await failure(
      env.direct.sdk.delegations.delegateDecryption({
        contractAddress: TOKEN,
        delegateAddress: DELEGATE,
      }),
    );
    const remoteError = await failure(
      grant(env, {
        contractAddress: bytes(TOKEN),
        delegateAddress: bytes(DELEGATE),
        expirationDateMs: undefined,
      }),
    );
    expect(directError).toBeInstanceOf(TransactionRevertedError);
    expect(errorCode(remoteError)).toBe(errorCode(directError));
    expect(errorCode(remoteError)).toBe("TRANSACTION_REVERTED");
  } finally {
    await env.close();
  }
});

test.each([
  ["a missing delegation message", undefined],
  ["a malformed address", { contractAddress: Buffer.alloc(19), delegateAddress: bytes(DELEGATE) }],
])("revoking rejects %s as an invalid argument", async (_, delegation) => {
  const env = await setup();
  try {
    const error = await failure(revoke(env, delegation));
    expect(errorCode(error)).toBe("INVALID_ARGUMENT");
    expect(env.remote().provider.readContract).not.toHaveBeenCalled();
    expect(env.writes).toEqual([]);
  } finally {
    await env.close();
  }
});

test("losing events then cancelling during a delegation receipt preserves the broadcast hash", async () => {
  let created: ReturnType<typeof fixture> | undefined;
  const runtime = new DaemonRuntime(async (_, signer, _storage, events) => {
    created = fixture(signer, undefined, undefined, events.onEvent);
    return { sdk: created.sdk, storageIdentities: [] };
  }, createCoordinator());
  const contextId = await runtime.createContext({
    config: undefined,
    signerEnabled: true,
    account: { address: bytes(USER), chainId: BigInt(anvil.id) },
    storage: undefined,
    permitStorage: undefined,
    transportKeyPairDerivationSecret: undefined,
  });
  const stream = new FakeStream<rpc.SignerServerMessage>();
  const signer = runtime.attachSigner(contextId, stream as unknown as SignerStream);
  const eventStream = new FakeStream<rpc.EventServerMessage>();
  runtime.attachEvents(contextId, eventStream as unknown as EventStream);
  const pendingReceipt = Promise.withResolvers<unknown>();
  vi.mocked(created!.provider.readContract).mockResolvedValue(0n as never);
  vi.mocked(created!.provider.waitForTransactionReceipt).mockReturnValue(
    pendingReceipt.promise as never,
  );
  const caller = new AbortController();
  try {
    const settled = runtime
      .execute({ contextId, operationId: "delegate" }, caller.signal, (sdk) =>
        sdk.delegations.delegateDecryption({ contractAddress: TOKEN, delegateAddress: DELEGATE }),
      )
      .catch((error: unknown) => error);
    await vi.waitFor(() => expect(frames(stream.messages, "action")).toHaveLength(1));
    const action = frames(stream.messages, "action")[0]!.action;
    expect(action.request?.$case).toBe("contractWrite");
    signer.reply({
      operationId: action.operationId,
      actionId: action.actionId,
      result: { $case: "transactionHash", transactionHash: bytes(HASH) },
    });
    await vi.waitFor(() =>
      expect(created!.provider.waitForTransactionReceipt).toHaveBeenCalledWith(HASH),
    );
    expect(frames(eventStream.messages, "delivery")).toHaveLength(1);
    eventStream.end();
    caller.abort();
    expect(errorDetails(await settled)).toEqual({
      code: "TRANSACTION_OUTCOME_UNKNOWN",
      message: expect.stringContaining(HASH),
      retryable: false,
      retryAfterSeconds: undefined,
    });
  } finally {
    pendingReceipt.resolve({ logs: [] });
    await runtime.close();
  }
});

test("a pre-broadcast ACL revert reports TRANSACTION_REVERTED with the selector, since the SDK aclAbi declares no errors, exactly like a viem simulation revert on the direct signer", async () => {
  const env = await setup();
  try {
    expiry(env, MAX_UINT64);
    env.wallet.reply = cooldownRevert;
    env.directSigner.write.mockRejectedValue(
      Object.assign(new Error(`Execution reverted (${COOLDOWN_SELECTOR})`), {
        cause: { data: undefined, raw: COOLDOWN_DATA, signature: COOLDOWN_SELECTOR },
      }),
    );
    const directError = await failure(
      env.direct.sdk.delegations.revokeDelegation({
        contractAddress: TOKEN,
        delegateAddress: DELEGATE,
      }),
    );
    const remoteError = await failure(
      revoke(env, { contractAddress: bytes(TOKEN), delegateAddress: bytes(DELEGATE) }),
    );
    expect(directError).toBeInstanceOf(TransactionRevertedError);
    expect(errorCode(remoteError)).toBe(errorCode(directError));
    expect(errorCode(remoteError)).toBe("TRANSACTION_REVERTED");
    expect((remoteError as ServiceError).details).toContain(COOLDOWN_SELECTOR);
    expect(env.writes).toHaveLength(1);
    // Nothing was broadcast, so neither side waits for a receipt.
    expect(env.remote().provider.waitForTransactionReceipt).not.toHaveBeenCalled();
    expect(env.direct.provider.waitForTransactionReceipt).not.toHaveBeenCalled();
  } finally {
    await env.close();
  }
});

test("a pre-broadcast ACL revert decoded against an ABI carrying the error entry maps to the delegation cooldown error", async () => {
  const controller = new AbortController();
  const signer = new RemoteSigner(account, () => controller.abort());
  const stream = new FakeStream<rpc.SignerServerMessage>();
  signer.attach(stream as unknown as SignerStream);
  try {
    const config = revokeDelegationContract(ACL, DELEGATE, TOKEN);
    const settled = operationContext
      .run({ id: "revoke", signal: controller.signal }, () =>
        signer.writeContract({
          ...config,
          abi: [...config.abi, ...COOLDOWN_ABI],
        } as WriteContractConfig),
      )
      .catch((error: unknown) => error);
    const action = frames(stream.messages, "action")[0]!.action;
    signer.reply({
      operationId: action.operationId,
      actionId: action.actionId,
      result: cooldownRevert(),
    });
    const error = await settled;
    expect((error as Error).cause).toEqual({
      data: {
        errorName: "AlreadyDelegatedOrRevokedInSameBlock",
        args: [USER, DELEGATE, TOKEN, 0x1234n],
      },
      raw: COOLDOWN_DATA,
      signature: COOLDOWN_SELECTOR,
    });
    expect(errorDetails(error)).toMatchObject({
      code: "TRANSACTION_REVERTED",
      message: `Execution reverted in revokeDelegationForUserDecryption on ${ACL}: AlreadyDelegatedOrRevokedInSameBlock(${json([USER, DELEGATE, TOKEN, 0x1234n])})`,
    });
    expect(matchAclRevert(error, error)).toBeInstanceOf(DelegationCooldownError);
  } finally {
    signer.dispose();
  }
});
