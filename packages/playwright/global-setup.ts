import { execSync, type ChildProcess, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import net from "node:net";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { NEXTJS_ANVIL_PORT, VITE_ANVIL_PORT } from "./fixtures/constants";

const __dirname = dirname(fileURLToPath(import.meta.url));
const contractsDir = resolve(__dirname, "../../contracts");
const ANVIL_DEPLOYER_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // Anvil account #0

function waitForPort(port: number, timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    let settled = false;
    const check = () => {
      if (settled) return;
      const socket = net.createConnection({ port, host: "127.0.0.1" });
      socket.on("connect", () => {
        socket.destroy();
        settled = true;
        resolve();
      });
      socket.on("error", () => {
        socket.destroy();
        if (settled) return;
        if (Date.now() - start > timeoutMs) {
          settled = true;
          reject(new Error(`Port ${port} not ready after ${timeoutMs}ms`));
        } else {
          setTimeout(check, 200);
        }
      });
    };
    check();
  });
}

function startAnvil(port: number): ChildProcess {
  const proc = spawn("anvil", ["--port", String(port), "--chain-id", "31337", "--silent"], {
    stdio: "ignore",
  });
  proc.on("error", (err) => {
    process.stderr.write(
      `Failed to start anvil on port ${port}: ${err.message}\n` +
        `Ensure 'anvil' (Foundry) is installed and on PATH.\n`,
    );
  });
  return proc;
}

const ports = [NEXTJS_ANVIL_PORT, VITE_ANVIL_PORT];

// Both anvil instances start from genesis with the same deployer key and nonce,
// so forge produces identical contract addresses on both chains. A single
// deployments.json is shared across projects.
export default async function globalSetup() {
  const anvils = ports.map(startAnvil);
  const teardown = () => {
    for (const proc of anvils) proc.kill();
  };

  try {
    await Promise.all(ports.map((p) => waitForPort(p)));

    // Deploy fhevm host stack to all anvil instances in parallel (single build).
    const portFlags = ports.map((p) => `--anvil-port ${p}`).join(" ");
    execSync(`./deploy-local.sh ${portFlags}`, {
      cwd: resolve(contractsDir, "lib/forge-fhevm"),
      stdio: "inherit",
      timeout: 300_000,
      env: {
        ...process.env,
      },
    });

    for (const port of ports) {
      execSync(
        `forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:${port} --broadcast --silent --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 --private-key ${ANVIL_DEPLOYER_PK}`,
        { cwd: contractsDir, stdio: "inherit", timeout: 300_000 },
      );
    }
  } catch (err) {
    teardown();
    throw err;
  }

  return teardown;
}
