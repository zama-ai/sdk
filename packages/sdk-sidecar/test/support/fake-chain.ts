import { createServer, type Server } from "node:http";
import {
  decodeFunctionData,
  encodeAbiParameters,
  keccak256,
  parseTransaction,
  recoverTransactionAddress,
  type Hex,
} from "viem";
import { aclAbi } from "../../../sdk/src/abi/acl.abi.js";
import { VALID_ENCRYPTED_VALUE } from "../../../sdk/src/test-fixtures/constants.js";
import { sepolia } from "../../../sdk/src/chains/index.js";

/** One accepted `eth_sendRawTransaction`, decoded with the ACL ABI. */
export interface Broadcast {
  hash: Hex;
  from: string;
  functionName: string;
  args: readonly unknown[];
}

export interface FakeChain {
  server: Server;
  /** Every JSON-RPC method the clients and the sidecar asked for, in order. */
  methods: string[];
  broadcasts: Broadcast[];
  /** Current ACL expiry for a (delegator, delegate, contract) triple. */
  expiryOf(delegator: string, delegate: string, contract: string): bigint;
}

const ACL = sepolia.aclContractAddress.toLowerCase();
const BLOCK_NUMBER = 0x1234n;
const BASE_FEE = 0x3b9aca00n;
const GAS_LIMIT = 0x1c9c380n;
const ZERO_HASH = `0x${"00".repeat(32)}` as const;
const BLOOM = `0x${"00".repeat(256)}` as const;

const quantity = (value: bigint) => `0x${value.toString(16)}`;
const key = (delegator: string, delegate: string, contract: string) =>
  [delegator, delegate, contract].map((address) => address.toLowerCase()).join("|");

function block(timestamp: bigint) {
  return {
    number: quantity(BLOCK_NUMBER),
    hash: `0x${"11".repeat(32)}`,
    parentHash: `0x${"22".repeat(32)}`,
    sha3Uncles: `0x${"33".repeat(32)}`,
    miner: `0x${"44".repeat(20)}`,
    stateRoot: ZERO_HASH,
    transactionsRoot: ZERO_HASH,
    receiptsRoot: ZERO_HASH,
    logsBloom: BLOOM,
    difficulty: "0x0",
    totalDifficulty: "0x0",
    gasLimit: quantity(GAS_LIMIT),
    gasUsed: "0x0",
    timestamp: quantity(timestamp),
    extraData: "0x",
    mixHash: ZERO_HASH,
    nonce: "0x0000000000000000",
    baseFeePerGas: quantity(BASE_FEE),
    size: "0x200",
    uncles: [],
    transactions: [],
    withdrawals: [],
    withdrawalsRoot: ZERO_HASH,
    blobGasUsed: "0x0",
    excessBlobGas: "0x0",
    parentBeaconBlockRoot: ZERO_HASH,
  };
}

/**
 * A deterministic in-memory Sepolia stand-in: ACL delegation state plus the node calls that
 * go-ethereum's bind and Alloy's fillers make when they build, sign and broadcast a write.
 */
export function createFakeChain(tokenName: string): FakeChain {
  const methods: string[] = [];
  const broadcasts: Broadcast[] = [];
  const nonces = new Map<string, number>();
  const expiries = new Map<string, bigint>();

  const call = (to: string | undefined, data: Hex | undefined): Hex => {
    if (data === undefined) {
      throw new Error("call without data");
    }
    if (data.startsWith("0x06fdde03")) {
      return encodeAbiParameters([{ type: "string" }], [tokenName]);
    }
    if (to?.toLowerCase() === ACL) {
      const { functionName, args } = decodeFunctionData({ abi: aclAbi, data });
      if (functionName !== "getUserDecryptionDelegationExpirationDate") {
        throw new Error(`unexpected ACL read ${functionName}`);
      }
      const [delegator, delegate, contract] = args as [string, string, string];
      return encodeAbiParameters(
        [{ type: "uint256" }],
        [expiries.get(key(delegator, delegate, contract)) ?? 0n],
      );
    }
    return VALID_ENCRYPTED_VALUE;
  };

  const broadcast = async (raw: `0x02${string}`): Promise<Hex> => {
    const transaction = parseTransaction(raw);
    if (transaction.to?.toLowerCase() !== ACL) {
      throw new Error(`transaction targets ${transaction.to} instead of the ACL`);
    }
    const from = await recoverTransactionAddress({ serializedTransaction: raw });
    const { functionName, args } = decodeFunctionData({
      abi: aclAbi,
      data: transaction.data ?? "0x",
    });
    const [delegate, contract] = args as [string, string];
    if (functionName === "delegateForUserDecryption") {
      expiries.set(key(from, delegate, contract), args[2] as bigint);
    } else if (functionName === "revokeDelegationForUserDecryption") {
      expiries.set(key(from, delegate, contract), 0n);
    } else {
      throw new Error(`unexpected ACL write ${functionName}`);
    }
    nonces.set(from.toLowerCase(), (transaction.nonce ?? 0) + 1);
    const hash = keccak256(raw);
    broadcasts.push({ hash, from, functionName, args });
    return hash;
  };

  const handle = async (method: string, params: readonly unknown[]): Promise<unknown> => {
    methods.push(method);
    const first = params[0] as { to?: string; data?: Hex; input?: Hex } | string | undefined;
    switch (method) {
      case "eth_chainId":
        return "0xaa36a7";
      case "eth_blockNumber":
        return quantity(BLOCK_NUMBER);
      case "eth_getBlockByNumber":
        return block(BigInt(Math.floor(Date.now() / 1000)));
      case "eth_gasPrice":
        return quantity(BASE_FEE * 2n);
      case "eth_maxPriorityFeePerGas":
        return quantity(BASE_FEE / 2n);
      case "eth_feeHistory":
        return {
          oldestBlock: quantity(BLOCK_NUMBER),
          baseFeePerGas: [quantity(BASE_FEE), quantity(BASE_FEE)],
          gasUsedRatio: [0.5],
          reward: [[quantity(BASE_FEE / 2n)]],
        };
      case "eth_getTransactionCount":
        return quantity(BigInt(nonces.get((first as string).toLowerCase()) ?? 0));
      case "eth_getCode":
        // go-ethereum's bind refuses to build a write against an address with no code.
        return "0x60006000";
      case "eth_estimateGas":
        return "0x186a0";
      case "eth_call": {
        const request = first as { to?: string; data?: Hex; input?: Hex };
        return call(request.to, request.data ?? request.input);
      }
      case "eth_sendRawTransaction":
        return broadcast(first as `0x02${string}`);
      case "eth_getTransactionReceipt": {
        const hash = (first as string).toLowerCase();
        const sent = broadcasts.find((entry) => entry.hash.toLowerCase() === hash);
        return sent === undefined
          ? null
          : {
              transactionHash: sent.hash,
              transactionIndex: "0x0",
              blockHash: `0x${"11".repeat(32)}`,
              blockNumber: quantity(BLOCK_NUMBER),
              from: sent.from,
              to: sepolia.aclContractAddress,
              cumulativeGasUsed: "0x186a0",
              gasUsed: "0x186a0",
              effectiveGasPrice: quantity(BASE_FEE),
              contractAddress: null,
              logs: [],
              logsBloom: BLOOM,
              status: "0x1",
              type: "0x2",
            };
      }
      default:
        throw new Error(`unsupported fixture method ${method}`);
    }
  };

  const server = createServer((request, response) => {
    const answer = async () => {
      let body = "";
      for await (const chunk of request) {
        body += String(chunk);
      }
      const reply = async (rpcCall: { id: number; method: string; params?: unknown[] }) => {
        try {
          return {
            jsonrpc: "2.0",
            id: rpcCall.id,
            result: await handle(rpcCall.method, rpcCall.params ?? []),
          };
        } catch (error) {
          return {
            jsonrpc: "2.0",
            id: rpcCall.id,
            error: { code: -32601, message: `fixture: ${(error as Error).message}` },
          };
        }
      };
      const payload = JSON.parse(body);
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify(
          Array.isArray(payload) ? await Promise.all(payload.map(reply)) : await reply(payload),
        ),
      );
    };
    void answer().catch(() => {
      response.statusCode = 500;
      response.end("fixture request failed");
    });
  });

  return {
    server,
    methods,
    broadcasts,
    expiryOf: (delegator, delegate, contract) =>
      expiries.get(key(delegator, delegate, contract)) ?? 0n,
  };
}
