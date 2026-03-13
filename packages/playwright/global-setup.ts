import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export default function globalSetup() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const contractsDir = resolve(__dirname, "../../contracts");
  console.log("Running deploy-local.sh...");
  execSync("./deploy-local.sh", {
    cwd: contractsDir,
    stdio: "inherit",
    timeout: 300_000,
  });
  console.log("Deploy complete.");
}
