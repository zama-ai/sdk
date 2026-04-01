"use client";

// ── LedgerWebHIDProvider ───────────────────────────────────────────────────────
//
// A minimal EIP-1193 provider built on top of @ledgerhq/hw-transport-webhid and
// @ledgerhq/hw-app-eth.  Covers the exact set of methods ZamaSDK needs:
//
//   eth_accounts / eth_requestAccounts  → getAddress(BIP-44 path)
//   personal_sign                       → signPersonalMessage
//   eth_signTypedData_v4 (EIP-712)      → two-tier strategy:
//                                          • Tier 1 (Nano X / S Plus / Stax / Flex):
//                                            signEIP712Message — device displays
//                                            each field name and value on screen
//                                          • Tier 2 fallback (Nano S):
//                                            hash domain + message locally with
//                                            ethers TypedDataEncoder, then call
//                                            signEIP712HashedMessage — device shows
//                                            a generic "Sign typed data? ⚠️" prompt
//   eth_sendTransaction                 → serialize EIP-1559 tx + signTransaction
//                                         + broadcast via Hoodi JsonRpcProvider
//   eth_chainId                         → hardcoded Hoodi (560048)
//   everything else (reads, estimates…) → forwarded to Hoodi JsonRpcProvider
//
// Additional public methods:
//   connect(accountIndex?)  — opens WebHID picker, returns address.
//                             accountIndex selects the BIP-44 account (default: 0,
//                             i.e. m/44'/60'/0'/0/0). Accepts 0–N.
//   verifyAddress()         — re-reads the address with display:true so the user
//                             can verify it on the device screen.
//
// The high-water mark on eth_blockNumber keeps ethers' PollingBlockSubscriber
// triggering receipt checks every poll interval instead of every ~12 s block.
//
// Disconnect recovery: if the device is unplugged after connect(), the transport's
// "disconnect" event resets state and emits EIP-1193 "accountsChanged" (with [])
// and "disconnect" events so the UI can return to the connect screen cleanly.
//
// Dev / test hook: the singleton is exposed on window.__ledgerProvider in
// non-production builds so Playwright tests can override connect() without
// opening a real WebHID device picker.
//
// Usage:
//   await ledgerProvider.connect(0);      // opens WebHID picker, returns address
//   await ledgerProvider.verifyAddress(); // displays address on device screen
//   ledgerProvider.on("accountsChanged", ([address]) => { … });
//   ledgerProvider.on("disconnect",      () => { … });
// ──────────────────────────────────────────────────────────────────────────────

import TransportWebHID from "@ledgerhq/hw-transport-webhid";
import type Transport from "@ledgerhq/hw-transport";
import Eth from "@ledgerhq/hw-app-eth";
import {
  JsonRpcProvider,
  Transaction,
  TypedDataEncoder,
  Signature,
  hexlify,
  toUtf8Bytes,
} from "ethers";
import { HOODI_CHAIN_ID, HOODI_RPC_URL } from "./config";
import type { EIP1193Provider } from "./ledgerProvider";

type EventHandler = (...args: unknown[]) => void;

// hw-app-eth by default fetches EIP-712 clear-signing metadata from
// crypto-assets-service.api.ledger.com. Hoodi testnet and Zama contracts are not
// registered in that service → every signing call triggers a 403 + CORS error that
// the library silently ignores. Setting calServiceURL: null skips the HTTP request
// entirely — behaviour is identical (blind signing) without the console noise.
const ETH_LOAD_CONFIG = { calServiceURL: null } as const;

export class LedgerWebHIDProvider implements EIP1193Provider {
  private transport: Transport | null = null;
  private _address: string | null = null;
  // BIP-44 path — updated on each connect() call based on accountIndex.
  private _path = "44'/60'/0'/0/0";
  private _highWaterBlock = 0n;
  private readonly rpc: JsonRpcProvider;
  private readonly listeners = new Map<string, Set<EventHandler>>();

  constructor() {
    this.rpc = new JsonRpcProvider(HOODI_RPC_URL);
    // Expose the singleton on window in non-production builds so Playwright tests
    // can override connect() without opening a real WebHID device picker.
    if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__ledgerProvider = this;
    }
  }

  // ── Public connect ──────────────────────────────────────────────────────────

  /**
   * Opens the WebHID device picker (or reconnects to a previously granted device),
   * reads the Ethereum address at the BIP-44 path for the given account index,
   * and emits "accountsChanged". Calling connect() while already connected closes
   * the previous transport first.
   *
   * @param accountIndex - BIP-44 account index (default: 0 → m/44'/60'/0'/0/0)
   */
  async connect(accountIndex = 0): Promise<string> {
    if (this.transport) {
      try {
        await this.transport.close();
      } catch {
        // ignore — transport may already be dead
      }
      this.transport = null;
    }

    this._path = `44'/60'/0'/0/${accountIndex}`;
    const transport = await TransportWebHID.create();
    this.transport = transport;

    // Reset state and emit disconnect events when the device is unplugged mid-session.
    // Capture `transport` in the closure to guard against stale events after a reconnect
    // — if connect() is called again before this fires, the IDs won't match.
    this.transport.on("disconnect", () => {
      if (this.transport === transport) this._onDisconnect();
    });

    const app = new Eth(this.transport, undefined, ETH_LOAD_CONFIG);

    // If getAddress() fails (wrong app open, device locked, etc.) close the
    // transport so it is not left dangling until the next connect() attempt.
    let address: string;
    try {
      ({ address } = await app.getAddress(this._path, /* display= */ false));
    } catch (err) {
      try {
        await this.transport.close();
      } catch {
        // ignore — transport may already be dead
      }
      this.transport = null;
      throw err;
    }

    const prev = this._address;
    this._address = address;
    if (prev !== address) this._fire("accountsChanged", [[address]]);
    return address;
  }

  /**
   * Displays the current address on the Ledger device screen so the user can
   * verify it matches what is shown in the browser (anti-phishing check).
   * Throws if the device is not connected.
   */
  async verifyAddress(): Promise<void> {
    const app = await this._app();
    await app.getAddress(this._path, /* display= */ true);
  }

  /**
   * Voluntarily closes the transport and emits the same events as a physical disconnect
   * ("accountsChanged" with [] + "disconnect" code 4900). Use this when the user
   * explicitly logs out or wants to switch to a different BIP-44 account.
   */
  async disconnect(): Promise<void> {
    if (this.transport) {
      try {
        await this.transport.close();
      } catch {
        // ignore — transport may already be dead
      }
    }
    this._onDisconnect();
  }

  // ── EIP-1193 interface ──────────────────────────────────────────────────────

  on(event: string, handler: EventHandler): void {
    let set = this.listeners.get(event);
    if (set === undefined) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler);
  }

  removeListener(event: string, handler: (...args: unknown[]) => void): void {
    this.listeners.get(event)?.delete(handler);
  }

  async request({ method, params = [] }: { method: string; params?: unknown[] }): Promise<unknown> {
    switch (method) {
      // ── Accounts ─────────────────────────────────────────────────────────────

      case "eth_accounts":
        return this._address ? [this._address] : [];

      case "eth_requestAccounts":
        // Return [] when no address is set — connect() must be called explicitly by the UI.
        // Auto-connecting here would bypass the WebHID user-gesture requirement and cause
        // unhandled rejections when ZamaProvider initialises before the user clicks Connect.
        return this._address ? [this._address] : [];

      // ── Chain ─────────────────────────────────────────────────────────────────

      case "eth_chainId":
        return `0x${HOODI_CHAIN_ID.toString(16)}`;

      // ── personal_sign ─────────────────────────────────────────────────────────
      // params: [message, address]
      // message is either a 0x-prefixed hex string or a raw UTF-8 string.
      // hw-app-eth signPersonalMessage expects a hex string without the 0x prefix.

      case "personal_sign": {
        const [msg] = params as [string];
        const hex = msg.startsWith("0x") ? msg.slice(2) : hexlify(toUtf8Bytes(msg)).slice(2);
        const app = await this._app();
        const { v, r, s } = await app.signPersonalMessage(this._path, hex);
        return `0x${r}${s}${this._normalizeV(v)}`;
      }

      // ── eth_signTypedData_v4 — EIP-712 ─────────────────────────────────────────
      // Two-tier signing strategy depending on device capabilities:
      //
      //   Tier 1 — signEIP712Message (Nano X, Nano S Plus, Stax, Flex)
      //     Sends the full typed-data object to the device. The Ethereum app
      //     displays each field name and value on screen.
      //
      //   Tier 2 — signEIP712HashedMessage (Nano S fallback)
      //     Pre-hash domain + message locally (ethers TypedDataEncoder), send
      //     the two 32-byte hashes. Device shows "Sign typed data? ⚠️" only.
      //
      // The try/catch auto-detects which tier the connected device supports.

      case "eth_signTypedData_v4": {
        // params: [address, typedDataJson]
        const [, raw] = params as [string, string | Record<string, unknown>];
        const parsed = typeof raw === "string" ? (JSON.parse(raw) as Record<string, unknown>) : raw;

        const { domain, types, message, primaryType } = parsed as {
          domain: Parameters<typeof TypedDataEncoder.hashDomain>[0];
          types: Record<string, { name: string; type: string }[]>;
          message: Record<string, unknown>;
          primaryType: string;
        };

        // Dev-only: log the full typed-data structure so developers can audit exactly
        // what the Zama Protocol asks users to sign and what appears on the device
        // screen in Tier 1 mode. Useful input for clear-signing recommendations.
        if (process.env.NODE_ENV !== "production") {
          console.group("[LedgerProvider] eth_signTypedData_v4");
          console.log("domain      :", domain);
          console.log("primaryType :", primaryType);
          console.log("types       :", types);
          console.log("message     :", message);
          console.groupEnd();
        }

        const app = await this._app();

        // ── Build EIP712Domain type entries from the domain object ───────────
        // ethers v6 strips EIP712Domain from `types` when serialising typed data
        // for eth_signTypedData_v4, but hw-app-eth requires it to be present in
        // the types map. Reconstruct it from whichever domain fields are set.
        const eip712DomainType: { name: string; type: string }[] =
          types["EIP712Domain"] ??
          [
            domain.name != null ? { name: "name", type: "string" } : null,
            domain.version != null ? { name: "version", type: "string" } : null,
            domain.chainId != null ? { name: "chainId", type: "uint256" } : null,
            domain.verifyingContract != null
              ? { name: "verifyingContract", type: "address" }
              : null,
            domain.salt != null ? { name: "salt", type: "bytes32" } : null,
          ].filter((e): e is { name: string; type: string } => e !== null);

        const typesWithDomain = {
          EIP712Domain: eip712DomainType,
          ...types,
        } as Record<string, { name: string; type: string }[]> & {
          EIP712Domain: { name: string; type: string }[];
        };

        // ── Tier 1: full typed-data display (Nano X / S Plus / Stax / Flex) ───
        try {
          const { v, r, s } = await app.signEIP712Message(this._path, {
            domain: {
              name: domain.name ?? undefined,
              version: domain.version ?? undefined,
              chainId:
                domain.chainId !== undefined && domain.chainId !== null
                  ? Number(domain.chainId)
                  : undefined,
              verifyingContract: domain.verifyingContract ?? undefined,
              salt:
                domain.salt !== undefined && domain.salt !== null ? String(domain.salt) : undefined,
            },
            types: typesWithDomain,
            message,
            primaryType,
          });
          return `0x${r}${s}${this._normalizeV(v)}`;
        } catch (err) {
          // 0x6D00 = INS_NOT_SUPPORTED: device firmware does not implement this
          // APDU command (Nano S). Fall through to the pre-hashed fallback below.
          //
          // Any other status code (0x6985 = user rejection, 0x6B00 = wrong param,
          // transport errors, etc.) must be re-thrown — silently falling through
          // would request a second signature from the user for the wrong operation.
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode !== 0x6d00) {
            if (process.env.NODE_ENV !== "production") {
              console.warn(
                `[LedgerProvider] signEIP712Message failed (status 0x${(statusCode ?? 0).toString(16)}) — not falling through:`,
                err,
              );
            }
            throw err;
          }
          if (process.env.NODE_ENV !== "production") {
            console.info(
              "[LedgerProvider] signEIP712Message not supported on this device (0x6D00) — using pre-hashed fallback",
            );
          }
        }

        // ── Tier 2: pre-hashed fallback (Nano S) ─────────────────────────────
        const domainHash = TypedDataEncoder.hashDomain(domain).slice(2); // strip 0x
        const msgTypes = Object.fromEntries(
          Object.entries(types).filter(([k]) => k !== "EIP712Domain"),
        ) as Record<string, { name: string; type: string }[]>;
        const encoder = TypedDataEncoder.from(msgTypes);
        const msgHash = encoder.hashStruct(primaryType, message).slice(2); // strip 0x

        const { v, r, s } = await app.signEIP712HashedMessage(this._path, domainHash, msgHash);
        return `0x${r}${s}${this._normalizeV(v)}`;
      }

      // ── eth_sendTransaction ───────────────────────────────────────────────────

      case "eth_sendTransaction": {
        const rawTx = (params as [Record<string, string | undefined>])[0];

        // Nonce — prefer caller-provided value, otherwise query "pending" count.
        const nonce = rawTx.nonce
          ? Number(rawTx.nonce)
          : Number(await this.rpc.send("eth_getTransactionCount", [this._address, "pending"]));

        // EIP-1559 fee parameters
        const feeData = await this.rpc.getFeeData();
        const maxPriorityFeePerGas = rawTx.maxPriorityFeePerGas
          ? BigInt(rawTx.maxPriorityFeePerGas)
          : (feeData.maxPriorityFeePerGas ?? 1_000_000_000n);
        const maxFeePerGas = rawTx.maxFeePerGas
          ? BigInt(rawTx.maxFeePerGas)
          : (feeData.maxFeePerGas ?? 3_000_000_000n);

        // Gas limit — add 20 % safety buffer when estimating.
        const providedGas = rawTx.gas ?? rawTx.gasLimit;
        const gasLimit = providedGas
          ? BigInt(providedGas)
          : (BigInt(
              await this.rpc.send("eth_estimateGas", [
                {
                  from: this._address,
                  to: rawTx.to,
                  value: rawTx.value,
                  data: rawTx.data,
                },
              ]),
            ) *
              12n) /
            10n;

        // Build unsigned EIP-1559 tx, sign it, attach signature in-place.
        const tx = Transaction.from({
          type: 2,
          chainId: HOODI_CHAIN_ID,
          nonce,
          maxPriorityFeePerGas,
          maxFeePerGas,
          gasLimit,
          to: rawTx.to,
          value: rawTx.value ? BigInt(rawTx.value) : 0n,
          data: rawTx.data ?? "0x",
        });

        const app = await this._app();
        // unsignedSerialized = "0x02<rlp…>" — strip the 0x prefix for hw-app-eth.
        const { v, r, s } = await app.signTransaction(
          this._path,
          tx.unsignedSerialized.slice(2),
          null, // null = blind signing; pass a resolution object for clear signing
        );

        // For EIP-1559, Ledger returns v as the recovery bit ("00" or "01").
        tx.signature = Signature.from({ r: `0x${r}`, s: `0x${s}`, v: parseInt(v, 16) });
        return this.rpc.send("eth_sendRawTransaction", [tx.serialized]);
      }

      // ── eth_blockNumber with high-water mark ───────────────────────────────────
      // Keeps ethers' PollingBlockSubscriber firing every poll interval (~4 s)
      // rather than once per block (~12 s on Hoodi).

      case "eth_blockNumber": {
        const block = await this.rpc.send("eth_blockNumber", []);
        const actual = BigInt(block as string);
        if (actual > this._highWaterBlock) this._highWaterBlock = actual;
        else this._highWaterBlock += 1n;
        return `0x${this._highWaterBlock.toString(16)}`;
      }

      // ── All other read-only methods → Hoodi RPC ────────────────────────────────

      default:
        return this.rpc.send(method, params as unknown[]);
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private _fire(event: string, args: unknown[]): void {
    this.listeners.get(event)?.forEach((fn) => fn(...args));
  }

  private async _app(): Promise<Eth> {
    if (!this.transport) {
      throw new Error("Ledger not connected. Call connect() first.");
    }
    return new Eth(this.transport, undefined, ETH_LOAD_CONFIG);
  }

  /**
   * Called when the transport emits "disconnect" (device unplugged mid-session).
   * Resets internal state and emits EIP-1193 "accountsChanged" + "disconnect".
   */
  private _onDisconnect(): void {
    this.transport = null;
    const hadAddress = this._address !== null;
    this._address = null;
    if (hadAddress) this._fire("accountsChanged", [[]]);
    // EIP-1193 disconnect — code 4900 = "Provider Disconnected"
    this._fire("disconnect", [{ code: 4900, message: "Ledger device disconnected" }]);
  }

  /**
   * hw-app-eth returns v as a plain number.
   * personal_sign / EIP-712 callers expect the canonical 0x1b (27) / 0x1c (28)
   * recovery ID. EIP-1559 signTransaction returns "00"/"01" as a hex string and
   * is handled separately via Signature.from().
   */
  private _normalizeV(v: number): string {
    return (v < 27 ? v + 27 : v).toString(16).padStart(2, "0");
  }
}

/** Singleton — shared by providers.tsx (signing) and page.tsx (connect UI). */
export const ledgerProvider = new LedgerWebHIDProvider();
