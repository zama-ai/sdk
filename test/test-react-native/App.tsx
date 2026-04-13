import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";
import {
  RelayerNative,
  SecureStoreAdapter,
  SqliteKvStoreAdapter,
  SepoliaConfig,
} from "@zama-fhe/react-native-sdk";
import { ZamaProvider, useEncrypt, usePublicKey } from "@zama-fhe/react-sdk";
import type { GenericSigner } from "@zama-fhe/sdk";

// ── Setup ────────────────────────────────────────────────────────────

const queryClient = new QueryClient();
const relayer = new RelayerNative(SepoliaConfig);
const storage = new SecureStoreAdapter();
const sessionStorage = new SqliteKvStoreAdapter();

// Placeholder signer — replace with a real wallet (WalletConnect, Privy, etc.)
const placeholderSigner: GenericSigner = {
  getChainId: async () => SepoliaConfig.chainId,
  getAddress: async () => "0x0000000000000000000000000000000000000000",
  signTypedData: async () => "0x",
  writeContract: async () => "0x",
  readContract: async () => undefined as never,
  waitForTransactionReceipt: async () => ({
    transactionHash: "0x",
    blockNumber: 0n,
    status: "success" as const,
    logs: [],
  }),
  getBlockTimestamp: async () => BigInt(Math.floor(Date.now() / 1000)),
};

// ── Components ───────────────────────────────────────────────────────

function SmokeTest() {
  const publicKey = usePublicKey();
  const encrypt = useEncrypt();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Zama React Native SDK</Text>

      <Text style={styles.label}>Public Key Status:</Text>
      <Text style={styles.value}>
        {publicKey.isLoading
          ? "Loading..."
          : publicKey.isError
            ? `Error: ${publicKey.error?.message}`
            : publicKey.data
              ? `OK (id: ${publicKey.data.publicKeyId.slice(0, 8)}...)`
              : "Not available"}
      </Text>

      <Text style={styles.label}>Encrypt Status:</Text>
      <Text style={styles.value}>
        {encrypt.isPending
          ? "Encrypting..."
          : encrypt.isError
            ? `Error: ${encrypt.error?.message}`
            : encrypt.isSuccess
              ? `OK (${encrypt.data.handles.length} handle(s))`
              : "Idle"}
      </Text>

      {/* oxlint-disable-next-line react/style-prop-object -- Expo StatusBar accepts string */}
      <StatusBar style="auto" />
    </View>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ZamaProvider
        relayer={relayer}
        signer={placeholderSigner}
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
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 32,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: 16,
    color: "#666",
  },
  value: {
    fontSize: 16,
    marginTop: 4,
  },
});
