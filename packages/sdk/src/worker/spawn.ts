/** Isolated so the CJS build can replace worker construction with an inert stub. */

/** False in the CJS stub, which ships no worker chunk; a caller-supplied `offloadWorker` source works in either build. */
export const BUNDLED_ENCRYPT_WORKER = true;

export function createEncryptWorker(): Worker {
  // Keep the `new Worker(new URL(...))` expression exactly in this inline
  // form: bundlers detect it statically to emit and rewrite the worker chunk,
  // and lose it if the URL is hoisted into a variable.
  return new Worker(new URL("./encrypt.worker.js", import.meta.url), {
    type: "module",
    name: "zama-fhe-encrypt",
  });
}
