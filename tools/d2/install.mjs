import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VERSION = "0.7.1";
const BIN_PATH = join(__dirname, "d2");

if (existsSync(BIN_PATH)) {
  process.exit(0);
}

const PLATFORM_MAP = {
  "darwin-arm64": `d2-v${VERSION}-macos-arm64.tar.gz`,
  "darwin-x64": `d2-v${VERSION}-macos-amd64.tar.gz`,
  "linux-x64": `d2-v${VERSION}-linux-amd64.tar.gz`,
  "linux-arm64": `d2-v${VERSION}-linux-arm64.tar.gz`,
};

const key = `${process.platform}-${process.arch}`;
const filename = PLATFORM_MAP[key];

if (!filename) {
  console.error(`Unsupported platform: ${key}`);
  console.error("Install d2 manually: https://github.com/terrastruct/d2/releases");
  process.exit(1);
}

const url = `https://github.com/terrastruct/d2/releases/download/v${VERSION}/${filename}`;
const tmpDir = join(__dirname, ".tmp-d2");

console.log(`Downloading d2 v${VERSION} for ${key}...`);

mkdirSync(tmpDir, { recursive: true });

try {
  const tarball = join(tmpDir, "d2.tar.gz");
  execFileSync("curl", ["-sL", "-o", tarball, url]);
  execFileSync("tar", ["xzf", tarball, "-C", tmpDir]);
  renameSync(join(tmpDir, `d2-v${VERSION}`, "bin", "d2"), BIN_PATH);
  chmodSync(BIN_PATH, 0o755);
  console.log(`d2 v${VERSION} installed successfully.`);
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}
