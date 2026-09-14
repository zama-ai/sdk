import { type Plugin, defineConfig } from "rolldown";
import { dts } from "rolldown-plugin-dts";

const shared = {
  external: [/^viem/, /^ethers/, /^@fhevm\/sdk/, /^@tanstack\/query-core/, /^node:/, /^zod($|\/)/],
  resolve: { tsconfigFilename: "tsconfig.build.json" },
  treeshake: true,
};

/**
 * The CJS output ships no worker chunk, so its spawn module becomes inert.
 * Dropping `new Worker(new URL(..., import.meta.url))` removes both the
 * `require("url")` shim that browser bundlers taking the require condition
 * choke on, and the reference to a file that only exists in dist/esm.
 */
const inertWorkerSpawn: Plugin = {
  name: "inert-worker-spawn",
  load(id) {
    if (!id.replaceAll("\\", "/").endsWith("/src/worker/spawn.ts")) {
      return null;
    }
    return [
      // A caller-supplied worker source brings its own script, so it still
      // works here; only the bundled spawn below is gone.
      "export const BUNDLED_ENCRYPT_WORKER = false;",
      "export function createEncryptWorker() {",
      '  throw new Error("The encrypt worker is only available in the ESM build.");',
      "}",
      "",
    ].join("\n");
  },
};

const NODE_STUB_PREFIX = "\0node-stub:";

const UNAVAILABLE_MESSAGE = "node built-ins are unavailable in the encrypt worker";

/**
 * `@fhevm/sdk` keeps node branches that are dead in a browser worker but leave
 * `node:` specifiers behind; webpack re-processes worker chunks and refuses to
 * resolve them for web targets. Resolving them to an inert module keeps the
 * rewriting out of the source text, so formatting and minification cannot move
 * the pattern out from under it.
 */
const nodeBuiltinStub: Plugin = {
  name: "node-builtin-stub",
  resolveId(source) {
    return source.startsWith("node:") ? `${NODE_STUB_PREFIX}${source.slice(5)}` : null;
  },
  load(id) {
    if (!id.startsWith(NODE_STUB_PREFIX)) {
      return null;
    }
    const specifier = `node:${id.slice(NODE_STUB_PREFIX.length)}`;
    // A throwing accessor rather than `undefined`: whichever arm reaches the
    // stub, the first use names the module instead of an anonymous TypeError.
    return [
      "const stub = new Proxy(Object.create(null), {",
      "  get(_target, property) {",
      "    if (property === Symbol.toPrimitive || property === Symbol.toStringTag) {",
      "      return undefined;",
      "    }",
      `    throw new Error('${UNAVAILABLE_MESSAGE} (read ' + String(property) + ' of "${specifier}").');`,
      "  },",
      "});",
      "module.exports = stub;",
      "",
    ].join("\n");
  },
};

/** `const fsModuleId = \`node:${fsModuleName}\`;`, the indirection `@fhevm/sdk`'s node branches use. */
const NODE_BUILTIN_BINDING = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*`node:\$\{[^`]*\}`/g;

const UNAVAILABLE = `Promise.reject(new Error("${UNAVAILABLE_MESSAGE}"))`;

/** Only `@fhevm/sdk` hides `node:` behind a computed specifier the resolver never sees. */
const FHEVM_SDK_SOURCE = "/@fhevm/sdk/";

const stripIndirectNodeBuiltins: Plugin = {
  name: "strip-indirect-node-builtins",
  transform(code, id) {
    if (!id.replaceAll("\\", "/").includes(FHEVM_SDK_SOURCE) || !code.includes("node:")) {
      return null;
    }
    let stripped = code;
    // The minifier folds the binding into the `import()` call, which turns an
    // indirect specifier the bundlers were told to ignore into a literal one.
    for (const [, name] of code.matchAll(NODE_BUILTIN_BINDING)) {
      stripped = stripped.replaceAll(
        new RegExp(String.raw`\bimport\(\s*(?:/\*(?:[^*]|\*(?!/))*\*/\s*)*${name}\s*\)`, "g"),
        UNAVAILABLE,
      );
    }
    return stripped === code ? null : { code: stripped };
  },
};

/** A module specifier, as opposed to the `node:` mentions left in error strings. */
const NODE_SPECIFIER = /\b(?:import|require)\s*\(\s*(["'`])node:|\bfrom\s*(["'])node:/;
const DYNAMIC_IMPORT = /\bimport\s*\(/;

/**
 * The worker must stay a single file with no imports of any kind. The indirect
 * rewrite above is regex-driven, so an upstream `@fhevm/sdk` change that moves
 * the pattern has to fail the build instead of shipping a worker that bundlers
 * refuse to resolve.
 */
const assertWorkerIsSelfContained: Plugin = {
  name: "assert-worker-self-contained",
  generateBundle(_options, bundle) {
    for (const [fileName, output] of Object.entries(bundle)) {
      if (output.type !== "chunk") {
        continue;
      }
      if (DYNAMIC_IMPORT.test(output.code)) {
        this.error(`${fileName} contains a dynamic import(); the worker must be self-contained.`);
      }
      if (NODE_SPECIFIER.test(output.code)) {
        this.error(`${fileName} still references a node: module specifier.`);
      }
    }
  },
};

const entryPoints = {
  index: "src/index.ts",
  "chains/index": "src/chains/index.ts",
  "cleartext/index": "src/cleartext/index.ts",
  "query/index": "src/query/index.ts",
  "web/index": "src/web/index.ts",
  "node/index": "src/node/index.ts",
  "viem/index": "src/viem/index.ts",
  "ethers/index": "src/ethers/index.ts",
};

export default defineConfig([
  // ESM build (primary)
  {
    input: entryPoints,
    output: { dir: "dist/esm", format: "esm", sourcemap: true, minify: true },
    ...shared,
    plugins: [dts({ tsconfig: "tsconfig.build.json" })],
  },
  // CJS build (for moduleResolution: "node" / CommonJS consumers)
  {
    input: entryPoints,
    output: {
      dir: "dist/cjs",
      format: "cjs",
      entryFileNames: "[name].cjs",
      chunkFileNames: "[name].cjs",
      sourcemap: true,
      minify: true,
    },
    ...shared,
    plugins: [inertWorkerSpawn],
  },
  // Encrypt worker: a single self-contained file at the ESM root, beside
  // rolldown's shared chunks, so the encrypt client resolves it relative to its
  // own chunk URL. Nothing stays external and dynamic imports are inlined
  // (`codeSplitting: false`): a file with no imports of any kind is the only
  // shape every consumer handles, and Vite's default worker format cannot
  // code-split.
  {
    input: { "encrypt.worker": "src/worker/encrypt.worker.ts" },
    output: {
      dir: "dist/esm",
      format: "iife",
      codeSplitting: false,
      // No sourcemap: it is huge (mostly inlined @fhevm/sdk) and would ship to
      // npm via the dist/**/*.map files glob.
      sourcemap: false,
      minify: true,
    },
    platform: "browser",
    resolve: { tsconfigFilename: "tsconfig.build.json" },
    treeshake: true,
    plugins: [nodeBuiltinStub, stripIndirectNodeBuiltins, assertWorkerIsSelfContained],
  },
]);
