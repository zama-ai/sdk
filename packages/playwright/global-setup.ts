import { execSync, type ChildProcess, spawn } from "node:child_process";
import net from "node:net";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { NEXTJS_ANVIL_PORT, VITE_ANVIL_PORT } from "./fixtures/constants";

const __dirname = dirname(fileURLToPath(import.meta.url));
const contractsDir = resolve(__dirname, "../../contracts");
const DEPLOYER_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

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
  return spawn("anvil", ["--port", String(port), "--chain-id", "31337", "--silent"], {
    stdio: "ignore",
  });
}

const ports = [NEXTJS_ANVIL_PORT, VITE_ANVIL_PORT];

// Both anvil instances start from genesis with the same deployer key and nonce,
// so forge produces identical contract addresses on both chains. A single
// deployments.json is shared across projects.
export default async function globalSetup() {
  const anvils = ports.map(startAnvil);
  await Promise.all(ports.map((p) => waitForPort(p)));

  // Deploy fhevm host stack to all anvil instances in parallel (single build).
  const portFlags = ports.map((p) => `--anvil-port ${p}`).join(" ");
  execSync(`./deploy-local.sh ${portFlags}`, {
    cwd: resolve(contractsDir, "lib/forge-fhevm"),
    stdio: "inherit",
    timeout: 300_000,
    env: {
      ...process.env,
      DEPLOYER_PRIVATE_KEY: DEPLOYER_PK,
      DECRYPTION_ADDRESS: "0x5ffdaAB0373E62E2ea2944776209aEf29E631A64",
      INPUT_VERIFICATION_ADDRESS: "0x812b06e1CDCE800494b79fFE4f925A504a9A9810",
      CHAIN_ID_GATEWAY: "10901",
      KMS_SIGNER_PRIVATE_KEY_0:
        "0x388b7680e4e1afa06efbfd45cdd1fe39f3c6af381df6555a19661f283b97de91",
      PUBLIC_DECRYPTION_THRESHOLD: "1",
      COPROCESSOR_SIGNER_PRIVATE_KEY_0:
        "0x7ec8ada6642fc4ccfb7729bc29c17cf8d21b61abd5642d1db992c0b8672ab901",
      COPROCESSOR_THRESHOLD: "1",
    },
  });

  // Deploy test contracts (ERC20s, wrappers, FeeManager) to each instance.
  for (const port of ports) {
    execSync(
      `forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:${port} --broadcast --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 --private-key ${DEPLOYER_PK}`,
      { cwd: contractsDir, stdio: "inherit", timeout: 300_000 },
    );
  }

  return () => {
    for (const proc of anvils) proc.kill();
  };
}
