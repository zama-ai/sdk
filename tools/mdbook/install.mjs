import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VERSION = "0.5.2";
const BIN_PATH = join(__dirname, "mdbook");

if (existsSync(BIN_PATH)) {
  process.exit(0);
}

const PLATFORM_MAP = {
  "darwin-arm64": `mdbook-v${VERSION}-aarch64-apple-darwin.tar.gz`,
  "darwin-x64": `mdbook-v${VERSION}-x86_64-apple-darwin.tar.gz`,
  "linux-x64": `mdbook-v${VERSION}-x86_64-unknown-linux-gnu.tar.gz`,
  "linux-arm64": `mdbook-v${VERSION}-aarch64-unknown-linux-gnu.tar.gz`,
};

const key = `${process.platform}-${process.arch}`;
const filename = PLATFORM_MAP[key];

if (!filename) {
  console.error(`Unsupported platform: ${key}`);
  console.error("Install mdbook manually: https://github.com/rust-lang/mdBook/releases");
  process.exit(1);
}

const url = `https://github.com/rust-lang/mdBook/releases/download/v${VERSION}/${filename}`;
const tmpDir = join(__dirname, ".tmp-mdbook");

console.log(`Downloading mdbook v${VERSION} for ${key}...`);

mkdirSync(tmpDir, { recursive: true });

try {
  const tarball = join(tmpDir, "mdbook.tar.gz");
  execFileSync("curl", ["-sL", "-o", tarball, url]);
  execFileSync("tar", ["xzf", tarball, "-C", tmpDir]);
  renameSync(join(tmpDir, "mdbook"), BIN_PATH);
  chmodSync(BIN_PATH, 0o755);
  console.log(`mdbook v${VERSION} installed successfully.`);
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}
