"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  createPublicClient,
  encodeFunctionData,
  formatUnits,
  hexToBytes,
  http,
  maxUint256,
  parseAbi,
  parseUnits,
  serializeTransaction,
  type Address,
  type Hex,
  type TransactionSerializableEIP1559,
} from "viem";
import { sepolia } from "viem/chains";
import { SEPOLIA_EXPLORER_URL, SEPOLIA_RPC_URL } from "@/lib/config";
import type { DeviceManagementKit, DiscoveredDevice } from "@ledgerhq/device-management-kit";

const SEPOLIA_CHAIN_ID = 11155111;
const LEDGER_DERIVATION_PATH = "44'/60'/0'/0/0";

const ZAMAMOCK_ADDRESS = "0x75355a85c6FB9df5f0C80FF54e8747EEe9a0BF57" as const;
const CZAMAMOCK_ADDRESS = "0xf2D628d2598aF4eAF94CB76a437Ff86CA78FfbFB" as const;

const ERC20_ABI = parseAbi([
  "function approve(address spender,uint256 amount) returns (bool)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
]);
const WRAPPER_ABI = parseAbi(["function wrap(address to,uint256 amount)"]);

type LedgerConnection = {
  dmk: DeviceManagementKit;
  sessionId: string;
  signer: {
    getAddress: (
      derivationPath: string,
      options?: {
        chainId?: number;
        checkOnDevice?: boolean;
        returnChainCode?: boolean;
        skipOpenApp?: boolean;
      },
    ) => DeviceAction<GetAddressOutput>;
    signTransaction: (
      derivationPath: string,
      transaction: Uint8Array,
      options?: { skipOpenApp?: boolean },
    ) => DeviceAction<LedgerSignature>;
  };
  address: Address;
};

type DeviceAction<Output> = {
  observable: {
    subscribe: (observer: {
      next?: (state: DeviceActionState<Output>) => void;
      error?: (error: unknown) => void;
      complete?: () => void;
    }) => { unsubscribe: () => void };
  };
  cancel: () => void;
};

type DeviceActionState<Output> =
  | { status: "not-started" }
  | { status: "pending"; intermediateValue?: unknown }
  | { status: "stopped" }
  | { status: "completed"; output: Output }
  | { status: "error"; error: unknown };

type GetAddressOutput = {
  address: Address;
  publicKey: string;
  chainCode?: string;
};

type LedgerSignature = {
  r: Hex;
  s: Hex;
  v: number;
};

type LogLevel = "info" | "success" | "warning" | "error";

type LedgerLog = {
  id: number;
  level: LogLevel;
  message: string;
};

type PreparedTransaction = {
  label: string;
  transaction: TransactionSerializableEIP1559;
  unsignedSerialized: Hex;
};

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(SEPOLIA_RPC_URL),
});

export default function LedgerClearSigningPage() {
  const [originToken, setOriginToken] = useState("");
  const [amount, setAmount] = useState("1");
  const [connection, setConnection] = useState<LedgerConnection | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSigningApproval, setIsSigningApproval] = useState(false);
  const [isSigningWrap, setIsSigningWrap] = useState(false);
  const [shouldBroadcast, setShouldBroadcast] = useState(true);
  const [allowance, setAllowance] = useState<bigint | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [lastTxHash, setLastTxHash] = useState<Hex | null>(null);
  const [lastSignedTx, setLastSignedTx] = useState<Hex | null>(null);
  const [logs, setLogs] = useState<LedgerLog[]>([]);

  const parsedAmount = useMemo(() => {
    try {
      return parseUnits(amount, 18);
    } catch {
      return null;
    }
  }, [amount]);

  const hasEnoughAllowance =
    parsedAmount !== null && allowance !== null ? allowance >= parsedAmount : false;
  const isUnlimitedAllowance = allowance === maxUint256;

  function addLog(level: LogLevel, message: string) {
    setLogs((current) => [...current, { id: Date.now() + current.length, level, message }]);
  }

  async function clearLedgerConnection(message?: string) {
    if (connection) {
      try {
        await connection.dmk.close();
      } catch (disconnectError) {
        addLog("warning", `Ledger cleanup warning: ${errorMessage(disconnectError)}.`);
      }
    }
    setConnection(null);
    if (message) {
      addLog("warning", message);
    }
  }

  async function refreshTokenState(address: Address) {
    const [nextAllowance, nextBalance] = await Promise.all([
      publicClient.readContract({
        address: ZAMAMOCK_ADDRESS,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [address, CZAMAMOCK_ADDRESS],
      }),
      publicClient.readContract({
        address: ZAMAMOCK_ADDRESS,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [address],
      }),
    ]);
    setAllowance(nextAllowance);
    setBalance(nextBalance);
    addLog(
      "info",
      `Token state refreshed: balance=${formatUnits(nextBalance, 18)} ZAMAMock, allowance=${formatUnits(
        nextAllowance,
        18,
      )} ZAMAMock.`,
    );
  }

  async function connectLedger() {
    setIsConnecting(true);
    setLastTxHash(null);
    setLastSignedTx(null);
    let dmk: DeviceManagementKit | null = null;
    let sessionId = "";
    try {
      addLog("info", "Loading Ledger DMK / WebHID / DSK modules.");
      const [
        { DeviceManagementKitBuilder },
        { webHidIdentifier, webHidTransportFactory },
        { SignerEthBuilder },
      ] = await Promise.all([
        import("@ledgerhq/device-management-kit"),
        import("@ledgerhq/device-transport-kit-web-hid"),
        import("@ledgerhq/device-signer-kit-ethereum"),
      ]);

      dmk = new DeviceManagementKitBuilder().addTransport(webHidTransportFactory).build();
      if (!dmk.isEnvironmentSupported()) {
        throw new Error(
          "WebHID is not available. Use a Chromium-based browser on localhost/HTTPS.",
        );
      }

      addLog("info", "Requesting WebHID access. Select your Ledger device in the browser prompt.");
      const device = await firstObservableValue<DiscoveredDevice>(
        dmk.startDiscovering({ transport: webHidIdentifier }),
        30_000,
      );
      await dmk.stopDiscovering();

      addLog("info", `Connecting to ${device.name || device.deviceModel.name}.`);
      sessionId = await dmk.connect({
        device,
        sessionRefresherOptions: { isRefresherDisabled: false },
      });

      const signer = new SignerEthBuilder({
        dmk,
        sessionId,
        originToken: originToken.trim() || undefined,
      }).build() as LedgerConnection["signer"];

      addLog(
        "info",
        `Reading Ledger address at ${LEDGER_DERIVATION_PATH}. Open the Ethereum app if prompted.`,
      );
      const addressOutput = await runDeviceAction<GetAddressOutput>(
        signer.getAddress(LEDGER_DERIVATION_PATH, {
          chainId: SEPOLIA_CHAIN_ID,
          checkOnDevice: false,
          returnChainCode: false,
          skipOpenApp: true,
        }),
        addLog,
      );

      const address = addressOutput.address;
      setConnection({ dmk, sessionId, signer, address });
      addLog("success", `Ledger connected: ${address}.`);
      await refreshTokenState(address);
    } catch (error) {
      addLog("error", errorMessage(error));
      if (dmk && sessionId) {
        try {
          await dmk.close();
        } catch {
          // Best-effort cleanup only.
        }
      }
    } finally {
      setIsConnecting(false);
    }
  }

  async function signApproval() {
    if (!connection) return;
    setIsSigningApproval(true);
    try {
      if (hasEnoughAllowance) {
        addLog("warning", "Approval skipped: allowance already covers the shield amount.");
        return;
      }
      const data = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [CZAMAMOCK_ADDRESS, maxUint256],
      });
      const tx = await prepareEip1559Transaction({
        from: connection.address,
        to: ZAMAMOCK_ADDRESS,
        data,
        fallbackGas: 70_000n,
        label: "Approve cZAMAMock wrapper to spend ZAMAMock",
      });
      await signAndMaybeBroadcast(
        connection,
        tx,
        shouldBroadcast,
        addLog,
        setLastSignedTx,
        setLastTxHash,
      );
      await refreshTokenState(connection.address);
    } catch (error) {
      addLog("error", errorMessage(error));
      await clearLedgerConnection(
        "Ledger session reset after approval failure. Reconnect before retrying.",
      );
    } finally {
      setIsSigningApproval(false);
    }
  }

  async function signWrap() {
    if (!connection || parsedAmount === null) return;
    setIsSigningWrap(true);
    try {
      const data = encodeFunctionData({
        abi: WRAPPER_ABI,
        functionName: "wrap",
        args: [connection.address, parsedAmount],
      });
      const tx = await prepareEip1559Transaction({
        from: connection.address,
        to: CZAMAMOCK_ADDRESS,
        data,
        fallbackGas: 140_000n,
        label: `Shield ${amount} ZAMAMock into cZAMAMock`,
      });
      await signAndMaybeBroadcast(
        connection,
        tx,
        shouldBroadcast,
        addLog,
        setLastSignedTx,
        setLastTxHash,
      );
      await refreshTokenState(connection.address);
    } catch (error) {
      addLog("error", errorMessage(error));
      await clearLedgerConnection(
        "Ledger session reset after shield signing failure. Reconnect before retrying.",
      );
    } finally {
      setIsSigningWrap(false);
    }
  }

  return (
    <div className="app-container ledger-page">
      <div className="app-header">
        <Link href="/" className="nav-link">
          Back to wagmi demo
        </Link>
        <h1>Ledger DSK Shield POC</h1>
        <p className="subtitle">
          Direct Ledger WebHID signing path for the ZAMAMock → cZAMAMock Sepolia shield flow. This
          bypasses Rabby and MetaMask so we can observe DSK clear-signing/fallback behavior.
        </p>
      </div>

      <div className="card ledger-warning">
        <div className="card-title">Important boundary</div>
        <p>
          This page can exercise the physical Ledger DSK path. It cannot force ERC-7730 clear
          signing by itself. Open the Ethereum app on the device before connecting or signing. The
          Ledger services still need a valid <code>originToken</code> and a signed descriptor
          available through registry/CAL for this contract selector.
        </p>
      </div>

      <div className="card">
        <div className="card-title">1. Connect Ledger</div>
        <label className="field-label" htmlFor="origin-token">
          Ledger originToken
        </label>
        <input
          id="origin-token"
          className="input"
          value={originToken}
          onChange={(event) => setOriginToken(event.target.value)}
          placeholder="Optional until Ledger provides one"
          type="password"
          autoComplete="off"
        />
        <p className="token-meta">
          Ledger documents this token as partner-provided and sensitive. For local testing, paste it
          manually instead of committing it to the repo.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={connectLedger}
          disabled={isConnecting}
        >
          {isConnecting ? "Connecting Ledger…" : "Connect Ledger via WebHID"}
        </button>
        {connection && (
          <>
            <div className="ledger-kv">
              <span>Ledger address</span>
              <strong>{connection.address}</strong>
              <span>Derivation path</span>
              <strong>{LEDGER_DERIVATION_PATH}</strong>
            </div>
            <div className="button-row">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void clearLedgerConnection("Ledger session cleared.")}
              >
                Reset Ledger session
              </button>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div className="card-title">2. Shield transaction</div>
        <div className="ledger-kv">
          <span>Public token</span>
          <strong>{ZAMAMOCK_ADDRESS}</strong>
          <span>Confidential wrapper</span>
          <strong>{CZAMAMOCK_ADDRESS}</strong>
          <span>Current balance</span>
          <strong>{balance === null ? "—" : `${formatUnits(balance, 18)} ZAMAMock`}</strong>
          <span>Current allowance</span>
          <strong>
            {allowance === null
              ? "—"
              : isUnlimitedAllowance
                ? "Unlimited"
                : `${formatUnits(allowance, 18)} ZAMAMock`}
          </strong>
        </div>

        <label className="field-label" htmlFor="shield-amount">
          Shield amount
        </label>
        <div className="amount-row">
          <input
            id="shield-amount"
            className="input"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
          />
          <span>ZAMAMock</span>
        </div>
        {parsedAmount === null && <p className="alert alert-error">Invalid token amount.</p>}
        {parsedAmount !== null && allowance !== null && !hasEnoughAllowance && (
          <p className="alert alert-warning">
            Allowance is lower than the shield amount. Sign the approval first.
          </p>
        )}
        {parsedAmount !== null && hasEnoughAllowance && (
          <p className="token-meta">Shield can be signed directly. Approval is already in place.</p>
        )}
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={shouldBroadcast}
            onChange={(event) => setShouldBroadcast(event.target.checked)}
          />
          Broadcast signed transaction after Ledger confirmation
        </label>

        <div className="button-row">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => connection && refreshTokenState(connection.address)}
            disabled={!connection}
          >
            Refresh token state
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={signApproval}
            disabled={!connection || isSigningApproval || isSigningWrap || hasEnoughAllowance}
          >
            {isSigningApproval
              ? "Signing approval…"
              : hasEnoughAllowance
                ? "Approval already set"
                : "Sign approval"}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={signWrap}
            disabled={!connection || parsedAmount === null || isSigningApproval || isSigningWrap}
          >
            {isSigningWrap ? "Signing shield…" : "Sign shield wrap"}
          </button>
        </div>
      </div>

      {(lastTxHash || lastSignedTx) && (
        <div className="card">
          <div className="card-title">Last result</div>
          {lastTxHash && (
            <p>
              Broadcast transaction:{" "}
              <a href={`${SEPOLIA_EXPLORER_URL}/tx/${lastTxHash}`} target="_blank" rel="noreferrer">
                {lastTxHash}
              </a>
            </p>
          )}
          {lastSignedTx && (
            <details className="clear-signing-json">
              <summary>Signed raw transaction</summary>
              <pre>{lastSignedTx}</pre>
            </details>
          )}
        </div>
      )}

      <div className="card">
        <div className="card-title">DSK log</div>
        {logs.length === 0 ? (
          <p className="token-meta">No Ledger action yet.</p>
        ) : (
          <ol className="ledger-log">
            {logs.map((log) => (
              <li key={log.id} className={`ledger-log-${log.level}`}>
                {log.message}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

async function prepareEip1559Transaction({
  from,
  to,
  data,
  fallbackGas,
  label,
}: {
  from: Address;
  to: Address;
  data: Hex;
  fallbackGas: bigint;
  label: string;
}): Promise<PreparedTransaction> {
  const [nonce, block, maxPriorityFeePerGas] = await Promise.all([
    publicClient.getTransactionCount({ address: from, blockTag: "pending" }),
    publicClient.getBlock(),
    publicClient.estimateMaxPriorityFeePerGas().catch(() => 1_500_000_000n),
  ]);
  const maxFeePerGas = (block.baseFeePerGas ?? 1_000_000_000n) * 2n + maxPriorityFeePerGas;
  const gas = await publicClient
    .estimateGas({ account: from, to, data, value: 0n })
    .catch(() => fallbackGas);

  const transaction = {
    type: "eip1559",
    chainId: SEPOLIA_CHAIN_ID,
    nonce,
    to,
    value: 0n,
    data,
    gas,
    maxFeePerGas,
    maxPriorityFeePerGas,
  } satisfies TransactionSerializableEIP1559;

  return {
    label,
    transaction,
    unsignedSerialized: serializeTransaction(transaction),
  };
}

async function signAndMaybeBroadcast(
  connection: LedgerConnection,
  prepared: PreparedTransaction,
  shouldBroadcast: boolean,
  addLog: (level: LogLevel, message: string) => void,
  setLastSignedTx: (tx: Hex) => void,
  setLastTxHash: (txHash: Hex | null) => void,
) {
  addLog("info", `Prepared transaction: ${prepared.label}.`);
  addLog("info", `Unsigned transaction: ${prepared.unsignedSerialized}.`);
  const signature = await runDeviceAction(
    connection.signer.signTransaction(
      LEDGER_DERIVATION_PATH,
      hexToBytes(prepared.unsignedSerialized),
      {
        skipOpenApp: true,
      },
    ),
    addLog,
  );
  addLog("success", `Ledger signature received: v=${signature.v}.`);

  const signedTransaction = serializeTransaction(prepared.transaction, {
    r: signature.r,
    s: signature.s,
    yParity: normalizeLedgerYParity(signature.v),
  });
  setLastSignedTx(signedTransaction);
  setLastTxHash(null);

  if (!shouldBroadcast) {
    addLog("warning", "Broadcast disabled. Signed raw transaction retained in the UI.");
    return;
  }

  const txHash = await publicClient.sendRawTransaction({
    serializedTransaction: signedTransaction,
  });
  setLastTxHash(txHash);
  addLog("success", `Broadcast submitted: ${txHash}.`);
}

function firstObservableValue<T>(
  observable: {
    subscribe: (observer: { next: (value: T) => void; error: (error: unknown) => void }) => {
      unsubscribe: () => void;
    };
  },
  timeoutMs: number,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let subscription: { unsubscribe: () => void } | undefined;
    const timeout = window.setTimeout(() => {
      subscription?.unsubscribe();
      reject(new Error("Timed out waiting for a Ledger device."));
    }, timeoutMs);
    subscription = observable.subscribe({
      next: (value) => {
        window.clearTimeout(timeout);
        subscription?.unsubscribe();
        resolve(value);
      },
      error: (error) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    });
  });
}

function runDeviceAction<Output>(
  action: DeviceAction<Output>,
  addLog: (level: LogLevel, message: string) => void,
): Promise<Output> {
  return new Promise((resolve, reject) => {
    const subscription = action.observable.subscribe({
      next: (state) => {
        if (state.status === "pending") {
          const formatted = formatIntermediateValue(state.intermediateValue);
          const level = /blind|fallback/i.test(formatted) ? "warning" : "info";
          addLog(level, `DSK step: ${formatted}.`);
          return;
        }
        if (state.status === "completed") {
          subscription.unsubscribe();
          resolve(state.output);
          return;
        }
        if (state.status === "error") {
          subscription.unsubscribe();
          reject(state.error);
          return;
        }
        if (state.status === "stopped") {
          subscription.unsubscribe();
          reject(new Error("Ledger action stopped."));
        }
      },
      error: (error) => {
        subscription.unsubscribe();
        reject(error);
      },
    });
  });
}

function formatIntermediateValue(value: unknown): string {
  if (typeof value !== "object" || value === null) {
    return String(value);
  }
  const maybeStep = "step" in value ? String(value.step) : undefined;
  const maybeInteraction =
    "requiredUserInteraction" in value ? String(value.requiredUserInteraction) : undefined;
  return [maybeStep, maybeInteraction].filter(Boolean).join(" / ") || JSON.stringify(value);
}

function normalizeLedgerYParity(v: number): 0 | 1 {
  if (v === 0 || v === 1) {
    return v;
  }
  if (v === 27 || v === 28) {
    return (v - 27) as 0 | 1;
  }
  if (v >= 35) {
    return ((v - 35) % 2) as 0 | 1;
  }
  throw new Error(`Unsupported Ledger signature v value: ${v}`);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "object" && error !== null) {
    return JSON.stringify(error);
  }
  return String(error);
}
