import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Go rejects a v2+ tag unless the module path ends in /vN; the SDK is past v1.
export function goModulePath(version) {
  const path = readFileSync("clients/go/go.mod", "utf8").match(/^module (\S+)$/m)?.[1];
  if (!path) {
    throw new Error("No module path found in clients/go/go.mod");
  }
  const major = version.split(".")[0];
  if (!path.endsWith(`/v${major}`)) {
    throw new Error(
      `Go rejects the tag clients/go/v${version} for module ${path}. Set the module path in clients/go/go.mod, and its imports, to .../v${major}.`,
    );
  }
  return path;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const version = process.argv[2];
  if (!version) {
    console.error("Usage: node scripts/release/go-module.mjs <version>");
    process.exit(1);
  }
  console.log(goModulePath(version));
}
