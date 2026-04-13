import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { createPublicClient, http, type Address, type Hash, type Hex } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { sepolia } from "viem/chains";
import { RelayerNative, SqliteKvStoreAdapter } from "@zama-fhe/react-native-sdk";
import { ZamaProvider, useEncrypt, usePublicKey } from "@zama-fhe/react-sdk";
import { SepoliaConfig, getTokenPairsLengthContract, type GenericSigner } from "@zama-fhe/sdk";

// ── Setup ────────────────────────────────────────────────────────────

const queryClient = new QueryClient();
const relayer = new RelayerNative({
  transports: { [SepoliaConfig.chainId]: SepoliaConfig },
  getChainId: async () => SepoliaConfig.chainId,
});
const storage = new SqliteKvStoreAdapter();
const sessionStorage = new SqliteKvStoreAdapter();

// Ephemeral account used only to derive a user address. No funds, no signing.
const ephemeralAccount = privateKeyToAccount(generatePrivateKey());

// Real Sepolia public client — issues eth_call / eth_blockNumber / etc.
// over the SDK's configured RPC. This is what makes the smoke tests
// actually hit Sepolia instead of a mock.
const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(SepoliaConfig.network),
});

// A real `GenericSigner` backed by viem. Reads go through the public client;
// write/sign paths throw loudly so a smoke test never silently misbehaves.
const sepoliaSigner: GenericSigner = {
  getChainId: async () => SepoliaConfig.chainId,
  getAddress: async () => ephemeralAccount.address,
  signTypedData: async () => {
    throw new Error("signTypedData not supported in smoke test (no wallet)");
  },
  writeContract: async () => {
    throw new Error("writeContract not supported in smoke test (no wallet)");
  },
  readContract: async (args) =>
    publicClient.readContract({
      address: args.address as Address,
      abi: args.abi,
      functionName: args.functionName,
      args: args.args,
    }) as never,
  waitForTransactionReceipt: async (hash) => {
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: hash as Hash,
    });
    return {
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      status: receipt.status,
      logs: receipt.logs.map((log) => ({
        address: log.address,
        topics: log.topics as Hex[],
        data: log.data,
      })),
    };
  },
  getBlockTimestamp: async () => {
    const block = await publicClient.getBlock({ blockTag: "latest" });
    return block.timestamp;
  },
};

// `WrappersRegistry` address on Sepolia. Mirrors the value published by
// `SepoliaConfig.registryAddress` — hardcoded here because the narrower
// `FhevmInstanceConfig` type re-exported by `@zama-fhe/react-sdk` drops the
// `registryAddress` field.
const REGISTRY_ADDRESS: Address = "0x2f0750Bbb0A246059d80e94c454586a7F27a128e";

// ── Test helpers ─────────────────────────────────────────────────────

type TestState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "ok"; detail: string }
  | { status: "fail"; detail: string };

function renderState(state: TestState): string {
  switch (state.status) {
    case "idle":
      return "Idle — tap to run";
    case "running":
      return "Running…";
    case "ok":
      return `OK — ${state.detail}`;
    case "fail":
      return `FAIL — ${state.detail}`;
  }
}

function stateColor(state: TestState): string {
  switch (state.status) {
    case "ok":
      return "#1b7a32";
    case "fail":
      return "#b21f1f";
    case "running":
      return "#a6690c";
    case "idle":
      return "#444";
  }
}

// ── Components ───────────────────────────────────────────────────────

function TestRow({
  label,
  state,
  onRun,
}: {
  label: string;
  state: TestState;
  onRun: () => void | Promise<void>;
}) {
  return (
    <Pressable
      onPress={() => {
        void onRun();
      }}
      disabled={state.status === "running"}
      style={({ pressed }) => [
        styles.row,
        pressed && styles.rowPressed,
        state.status === "running" && styles.rowDisabled,
      ]}
    >
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { color: stateColor(state) }]}>{renderState(state)}</Text>
    </Pressable>
  );
}

function SmokeTest() {
  const publicKey = usePublicKey();
  const encrypt = useEncrypt();

  const [kvStoreState, setKvStoreState] = useState<TestState>({
    status: "idle",
  });
  const [cryptoState, setCryptoState] = useState<TestState>({ status: "idle" });
  const [rpcState, setRpcState] = useState<TestState>({ status: "idle" });
  const [registryState, setRegistryState] = useState<TestState>({
    status: "idle",
  });
  const [encryptState, setEncryptState] = useState<TestState>({
    status: "idle",
  });
  const [textCodecState, setTextCodecState] = useState<TestState>({
    status: "idle",
  });
  const [storeOverwriteState, setStoreOverwriteState] = useState<TestState>({
    status: "idle",
  });
  const [relayerKeyState, setRelayerKeyState] = useState<TestState>({
    status: "idle",
  });
  const [keypairState, setKeypairState] = useState<TestState>({
    status: "idle",
  });
  const [encryptTypesState, setEncryptTypesState] = useState<TestState>({
    status: "idle",
  });
  const [encryptFreshnessState, setEncryptFreshnessState] = useState<TestState>({ status: "idle" });

  // --- 2. SQLite KV round-trip ----------------------------------------
  async function runKvStore() {
    setKvStoreState({ status: "running" });
    try {
      const key = "smoke_kv";
      const payload = { at: Date.now(), n: 42 };
      await sessionStorage.set(key, payload);
      const readBack = await sessionStorage.get<typeof payload>(key);
      if (!readBack || readBack.n !== 42) {
        throw new Error("read-back mismatch");
      }
      await sessionStorage.delete(key);
      if ((await sessionStorage.get(key)) !== null) {
        throw new Error("delete did not remove the entry");
      }
      setKvStoreState({ status: "ok", detail: "set/get/delete round-trip" });
    } catch (error) {
      setKvStoreState({ status: "fail", detail: String(error) });
    }
  }

  // --- 3. crypto.getRandomValues polyfill -----------------------------
  function runCryptoPolyfill() {
    setCryptoState({ status: "running" });
    try {
      if (typeof globalThis.crypto?.getRandomValues !== "function") {
        throw new TypeError("crypto.getRandomValues not installed");
      }
      const a = new Uint8Array(16);
      const b = new Uint8Array(16);
      globalThis.crypto.getRandomValues(a);
      globalThis.crypto.getRandomValues(b);
      if (a.every((byte) => byte === 0)) {
        throw new Error("RNG returned all zeros");
      }
      if (a.every((byte, i) => byte === b[i])) {
        throw new Error("two samples were identical");
      }
      setCryptoState({ status: "ok", detail: "16 random bytes, non-trivial" });
    } catch (error) {
      setCryptoState({ status: "fail", detail: String(error) });
    }
  }

  // --- 4. Raw Sepolia RPC reachability --------------------------------
  async function runRpcBlock() {
    setRpcState({ status: "running" });
    try {
      const [chainId, blockNumber] = await Promise.all([
        publicClient.getChainId(),
        publicClient.getBlockNumber(),
      ]);
      if (chainId !== SepoliaConfig.chainId) {
        throw new Error(`RPC reports chainId ${chainId}, expected ${SepoliaConfig.chainId}`);
      }
      setRpcState({
        status: "ok",
        detail: `chain ${chainId}, block ${blockNumber}`,
      });
    } catch (error) {
      setRpcState({ status: "fail", detail: String(error) });
    }
  }

  // --- 5. Read the WrappersRegistry tokenPairs length on Sepolia ---------------
  // Exercises the real `GenericSigner.readContract` path against a live
  // deployment and confirms the SDK's published Sepolia addresses resolve.
  async function runRegistryRead() {
    setRegistryState({ status: "running" });
    try {
      const length = (await sepoliaSigner.readContract(
        getTokenPairsLengthContract(REGISTRY_ADDRESS),
      )) as bigint;
      setRegistryState({
        status: "ok",
        detail: `registry.length() = ${length}`,
      });
    } catch (error) {
      setRegistryState({ status: "fail", detail: String(error) });
    }
  }

  // --- 6. useEncrypt via the native Fhevm module + real Sepolia keys --
  async function runEncrypt() {
    setEncryptState({ status: "running" });
    try {
      const result = await encrypt.mutateAsync({
        contractAddress: REGISTRY_ADDRESS,
        userAddress: ephemeralAccount.address,
        values: [
          { type: "euint64", value: 42n },
          { type: "ebool", value: true },
        ],
      });
      if (result.handles.length !== 2) {
        throw new Error(`expected 2 handles, got ${result.handles.length}`);
      }
      setEncryptState({
        status: "ok",
        detail: `${result.handles.length} handles, proof ${result.inputProof.length} bytes`,
      });
    } catch (error) {
      setEncryptState({ status: "fail", detail: String(error) });
    }
  }

  // --- 7. TextEncoder / TextDecoder polyfills -------------------------
  // The SDK serializes JSON for relayer requests and decodes UTF-8 from
  // wasm; both rely on TextEncoder/TextDecoder being globally available
  // under Hermes.
  function runTextCodec() {
    setTextCodecState({ status: "running" });
    try {
      if (typeof globalThis.TextEncoder !== "function") {
        throw new TypeError("TextEncoder not installed");
      }
      if (typeof globalThis.TextDecoder !== "function") {
        throw new TypeError("TextDecoder not installed");
      }
      const sample = "Zama 🔐 — fhevm";
      const encoded = new TextEncoder().encode(sample);
      const decoded = new TextDecoder().decode(encoded);
      if (decoded !== sample) {
        throw new Error(`round-trip mismatch: ${decoded}`);
      }
      setTextCodecState({
        status: "ok",
        detail: `${encoded.length} bytes round-tripped`,
      });
    } catch (error) {
      setTextCodecState({ status: "fail", detail: String(error) });
    }
  }

  // --- 8. Storage overwrite semantics ---------------------------------
  // A second `set` for the same key must replace, not append/duplicate.
  // Exercises the contract of whichever adapter is wired to `storage`.
  async function runStoreOverwrite() {
    setStoreOverwriteState({ status: "running" });
    try {
      const key = "smoke_overwrite";
      await storage.set(key, { v: 1 });
      await storage.set(key, { v: 2 });
      const readBack = await storage.get<{ v: number }>(key);
      if (!readBack || readBack.v !== 2) {
        throw new Error(`expected v=2, got ${JSON.stringify(readBack)}`);
      }
      await storage.delete(key);
      setStoreOverwriteState({
        status: "ok",
        detail: "second set replaced first",
      });
    } catch (error) {
      setStoreOverwriteState({ status: "fail", detail: String(error) });
    }
  }

  // --- 9. Relayer.getPublicKey direct call ----------------------------
  // Exercises the native fhevm bridge independently of `usePublicKey`.
  async function runRelayerKey() {
    setRelayerKeyState({ status: "running" });
    try {
      const pk = await relayer.getPublicKey();
      if (!pk?.publicKeyId || pk.publicKeyId.length === 0) {
        throw new Error("relayer returned empty publicKeyId");
      }
      if (!pk.publicKey || pk.publicKey.length === 0) {
        throw new Error("relayer returned empty publicKey bytes");
      }
      setRelayerKeyState({
        status: "ok",
        detail: `id ${pk.publicKeyId.slice(0, 8)}…, ${pk.publicKey.length}B`,
      });
    } catch (error) {
      setRelayerKeyState({ status: "fail", detail: String(error) });
    }
  }

  // --- 10. Relayer.generateKeypair ------------------------------------
  // Exercises the native RNG path used for user-decrypt sessions.
  async function runGenerateKeypair() {
    setKeypairState({ status: "running" });
    try {
      const kp = await relayer.generateKeypair();
      if (!kp.privateKey || !kp.publicKey) {
        throw new Error("missing keypair fields");
      }
      if (kp.privateKey === kp.publicKey) {
        throw new Error("private and public keys are identical");
      }
      const second = await relayer.generateKeypair();
      if (second.privateKey === kp.privateKey) {
        throw new Error("two keypairs collided — RNG is broken");
      }
      setKeypairState({
        status: "ok",
        detail: `pub ${kp.publicKey.length}B, priv ${kp.privateKey.length}B`,
      });
    } catch (error) {
      setKeypairState({ status: "fail", detail: String(error) });
    }
  }

  // --- 11. useEncrypt across multiple integer widths ------------------
  async function runEncryptTypes() {
    setEncryptTypesState({ status: "running" });
    try {
      const result = await encrypt.mutateAsync({
        contractAddress: REGISTRY_ADDRESS,
        userAddress: ephemeralAccount.address,
        values: [
          { type: "euint8", value: 7n },
          { type: "euint32", value: 123_456n },
          { type: "euint128", value: (1n << 100n) + 5n },
        ],
      });
      if (result.handles.length !== 3) {
        throw new Error(`expected 3 handles, got ${result.handles.length}`);
      }
      for (const [i, handle] of result.handles.entries()) {
        if (!handle || handle.length === 0) {
          throw new Error(`handle ${i} is empty`);
        }
      }
      setEncryptTypesState({
        status: "ok",
        detail: `euint8/32/128 → ${result.handles.length} handles`,
      });
    } catch (error) {
      setEncryptTypesState({ status: "fail", detail: String(error) });
    }
  }

  // --- 12. Encryption freshness (non-determinism) ---------------------
  // Encrypting the same plaintext twice MUST produce different ciphertexts.
  async function runEncryptFreshness() {
    setEncryptFreshnessState({ status: "running" });
    try {
      const params = {
        contractAddress: REGISTRY_ADDRESS,
        userAddress: ephemeralAccount.address,
        values: [{ type: "euint64" as const, value: 42n }],
      };
      const [a, b] = await Promise.all([encrypt.mutateAsync(params), encrypt.mutateAsync(params)]);
      if (a.inputProof === b.inputProof) {
        throw new Error("two encryptions produced identical input proofs");
      }
      if (a.handles[0] === b.handles[0]) {
        throw new Error("two encryptions produced identical handles");
      }
      setEncryptFreshnessState({
        status: "ok",
        detail: "two encryptions of 42n diverge",
      });
    } catch (error) {
      setEncryptFreshnessState({ status: "fail", detail: String(error) });
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Zama RN SDK — Sepolia Smoke Tests</Text>

      <Text style={styles.label}>User address (ephemeral):</Text>
      <Text style={styles.value} numberOfLines={1}>
        {ephemeralAccount.address}
      </Text>

      <Text style={styles.label}>Public Key (auto-loaded from relayer):</Text>
      <Text style={styles.value}>
        {publicKey.isLoading
          ? "Loading…"
          : publicKey.isError
            ? `Error: ${publicKey.error?.message}`
            : publicKey.data
              ? `OK (id: ${publicKey.data.publicKeyId.slice(0, 8)}…)`
              : "Not available"}
      </Text>

      <View style={styles.sectionGap} />

      <TestRow label="expo-sqlite kv-store adapter" state={kvStoreState} onRun={runKvStore} />
      <TestRow
        label="crypto.getRandomValues polyfill"
        state={cryptoState}
        onRun={runCryptoPolyfill}
      />
      <TestRow
        label="Sepolia RPC: eth_chainId + eth_blockNumber"
        state={rpcState}
        onRun={runRpcBlock}
      />
      <TestRow
        label="Sepolia read: WrappersRegistry tokenPairs length"
        state={registryState}
        onRun={runRegistryRead}
      />
      <TestRow
        label="useEncrypt (native Fhevm, Sepolia keys)"
        state={encryptState}
        onRun={runEncrypt}
      />
      <TestRow
        label="TextEncoder / TextDecoder polyfills"
        state={textCodecState}
        onRun={runTextCodec}
      />
      <TestRow
        label="Storage: overwrite semantics"
        state={storeOverwriteState}
        onRun={runStoreOverwrite}
      />
      <TestRow
        label="Relayer.getPublicKey (direct)"
        state={relayerKeyState}
        onRun={runRelayerKey}
      />
      <TestRow
        label="Relayer.generateKeypair (RNG sanity)"
        state={keypairState}
        onRun={runGenerateKeypair}
      />
      <TestRow
        label="useEncrypt: euint8 / euint32 / euint128"
        state={encryptTypesState}
        onRun={runEncryptTypes}
      />
      <TestRow
        label="useEncrypt: freshness (two encrypts diverge)"
        state={encryptFreshnessState}
        onRun={runEncryptFreshness}
      />

      {/* oxlint-disable-next-line react/style-prop-object -- Expo StatusBar accepts string */}
      <StatusBar style="auto" />
    </ScrollView>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ZamaProvider
        relayer={relayer}
        signer={sepoliaSigner}
        storage={storage}
        sessionStorage={sessionStorage}
      >
        <SmokeTest />
      </ZamaProvider>
    </QueryClientProvider>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    padding: 24,
    paddingTop: 64,
    backgroundColor: "#fff",
    minHeight: "100%",
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 24,
  },
  sectionGap: {
    height: 24,
  },
  row: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fafafa",
  },
  rowPressed: {
    backgroundColor: "#eee",
  },
  rowDisabled: {
    opacity: 0.5,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#222",
    marginBottom: 4,
  },
  value: {
    fontSize: 14,
  },
});
