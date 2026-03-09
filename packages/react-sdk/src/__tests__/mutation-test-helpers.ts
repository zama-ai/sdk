import { act } from "@testing-library/react";
import { QueryClient, type QueryKey } from "@tanstack/react-query";
import type { Address, GenericSigner, Token } from "@zama-fhe/sdk";
import { expect, vi } from "../test-fixtures";
import { createMockRelayer, createMockSigner } from "../../../sdk/src/test-fixtures";
import { expectCacheInvalidated } from "../test-helpers";

export const TOKEN = "0x1111111111111111111111111111111111111111" as Address;
export const USER = "0x2222222222222222222222222222222222222222" as Address;
export const SPENDER = "0x3333333333333333333333333333333333333333" as Address;
export const WRAPPER = "0x4444444444444444444444444444444444444444" as Address;
export const COORDINATOR = "0x5555555555555555555555555555555555555555" as Address;
export const FEE_MANAGER = "0x6666666666666666666666666666666666666666" as Address;
export const TOKEN_B = "0x7777777777777777777777777777777777777777" as Address;
export const WAGMI_BALANCE_KEY = [
  "readContract",
  { functionName: "balanceOf", address: TOKEN, args: [USER] },
] as const;
export const OTHER_TOKEN = "0x9999999999999999999999999999999999999999" as Address;
export const RECIPIENT = "0x8888888888888888888888888888888888888888" as Address;

export const HANDLE = `0x${"11".repeat(32)}` as Address;
export const BURN_AMOUNT_HANDLE = `0x${"22".repeat(32)}` as Address;
export const DECRYPTION_PROOF = `0x${"33".repeat(32)}` as Address;
export const UNDERLYING = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
export const UNWRAP_REQUESTED_TOPIC =
  "0x77d02d353c5629272875d11f1b34ec4c65d7430b075575b78cd2502034c469ee";
export const TRANSFER_FROM = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as Address;
export const DEFAULT_IDLE_MUTATION_STATE = {
  context: undefined,
  data: undefined,
  error: null,
  failureCount: 0,
  failureReason: null,
  isError: false,
  isIdle: true,
  isPaused: false,
  isPending: false,
  isSuccess: false,
  status: "idle",
  submittedAt: 0,
  variables: undefined,
} as const;

export function toTopicAddress(address: Address): Address {
  return `0x${address.slice(2).padStart(64, "0")}` as Address;
}

export function createUnwrapRequestedLog(handle: Address) {
  return {
    topics: [UNWRAP_REQUESTED_TOPIC, toTopicAddress(USER)],
    data: handle,
  };
}

export function mockPublicDecrypt(relayer: ReturnType<typeof createMockRelayer>) {
  vi.mocked(relayer.publicDecrypt).mockResolvedValue({
    clearValues: {},
    abiEncodedClearValues: "0x1",
    decryptionProof: DECRYPTION_PROOF,
  });
}

export const MOCK_TOKEN_ADDRESS = "0xtoken" as Address;
export function createMockToken(
  address: Address = MOCK_TOKEN_ADDRESS,
  signer: GenericSigner = createMockSigner(),
) {
  const mockResult = { txHash: "0xtx", receipt: { logs: [] } };
  return {
    address,
    signer,
    confidentialTransfer: vi.fn().mockResolvedValue(mockResult),
    confidentialTransferFrom: vi.fn().mockResolvedValue(mockResult),
    approve: vi.fn().mockResolvedValue(mockResult),
    approveUnderlying: vi.fn().mockResolvedValue(mockResult),
    shield: vi.fn().mockResolvedValue(mockResult),
    shieldETH: vi.fn().mockResolvedValue(mockResult),
    unwrap: vi.fn().mockResolvedValue(mockResult),
    unwrapAll: vi.fn().mockResolvedValue(mockResult),
    finalizeUnwrap: vi.fn().mockResolvedValue(mockResult),
    unshield: vi.fn().mockResolvedValue(mockResult),
    unshieldAll: vi.fn().mockResolvedValue(mockResult),
    resumeUnshield: vi.fn().mockResolvedValue(mockResult),
    delegateDecryption: vi.fn().mockResolvedValue(mockResult),
  } as unknown as Token;
}

export function expectDefaultMutationState(state: unknown) {
  expect(state).toEqual(DEFAULT_IDLE_MUTATION_STATE);
}

export async function mutateAndExpectOnSuccess(
  mutate: () => Promise<unknown>,
  onSuccess: ReturnType<typeof vi.fn>,
  assertClient: (client: QueryClient) => void,
  options: { variables: "defined" | "undefined" } = { variables: "defined" },
) {
  await act(mutate);
  expect(onSuccess).toHaveBeenCalledOnce();

  const [data, variables, _onMutateResult, context] = onSuccess.mock.calls[0]!;
  expect(data).toBeDefined();
  if (options.variables === "undefined") {
    expect(variables).toBeUndefined();
  } else {
    expect(variables).toBeDefined();
  }
  expect(context.client).toBeInstanceOf(QueryClient);

  assertClient(context.client);
}

export function expectInvalidatedQueries(client: QueryClient, keys: QueryKey[]) {
  for (const key of keys) {
    expectCacheInvalidated(client, key);
  }
}
