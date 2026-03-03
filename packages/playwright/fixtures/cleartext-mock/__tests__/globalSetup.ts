import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";

const RPC_URL = "http://127.0.0.1:8545";
const PORT = 8545;

function isPortListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(500);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => {
      resolve(false);
    });
    socket.connect(port, "127.0.0.1");
  });
}

async function waitForRpc(url: string, timeoutMs = 15_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_chainId",
          params: [],
          id: 1,
        }),
      });
      if (response.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Anvil did not become ready within ${timeoutMs}ms`);
}

let proc: ChildProcess | undefined;

export async function setup(): Promise<void> {
  if (await isPortListening(PORT)) {
    console.log("[globalSetup] Node already running on port", PORT);
    return;
  }

  console.log("[globalSetup] Spawning anvil...");
  proc = spawn("anvil", ["--chain-id", "31337", "--silent"], {
    stdio: "pipe",
    detached: false,
  });

  proc.stderr?.on("data", (chunk: Buffer) => {
    const msg = chunk.toString();
    if (msg.includes("Error") || msg.includes("error")) {
      console.error("[anvil stderr]", msg);
    }
  });

  await waitForRpc(RPC_URL);
  console.log("[globalSetup] Anvil is ready");
}

export async function teardown(): Promise<void> {
  if (proc) {
    console.log("[globalSetup] Stopping anvil...");
    proc.kill("SIGTERM");
    proc = undefined;
  }
}
