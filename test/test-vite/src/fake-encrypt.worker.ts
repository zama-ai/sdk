import { expose } from "comlink";
import {
  FAKE_WORKER_BUSY_MESSAGE,
  FAKE_WORKER_BUSY_MS,
  FAKE_WORKER_READY_MESSAGE,
} from "./fake-encrypt-worker-protocol";

/**
 * Protocol-compliant stand-in for the SDK's encrypt worker: same ready message,
 * same Comlink API, but it burns CPU synchronously instead of proving anything.
 * That keeps the responsiveness assertion hermetic, where a real proof would
 * need the ~50 MB FHE key and a live relayer.
 */

/** Shaped like a real `encryptValue` result; nothing under test reads the bytes. */
const CANNED_SINGLE_RESULT = {
  encryptedValue: `0x${"11".repeat(32)}`,
  inputProof: `0x${"22".repeat(32)}`,
};

/** Shaped like a real `encryptValues` result; nothing under test reads the bytes. */
const CANNED_BATCH_RESULT = {
  encryptedValues: [`0x${"11".repeat(32)}`],
  inputProof: `0x${"22".repeat(32)}`,
};

function burn(): void {
  const until = performance.now() + FAKE_WORKER_BUSY_MS;
  while (performance.now() < until) {
    // Spin: a sleep would yield the event loop and prove nothing.
  }
}

function encryptValue() {
  postMessage(FAKE_WORKER_BUSY_MESSAGE);
  burn();
  return Promise.resolve(CANNED_SINGLE_RESULT);
}

function encryptValues() {
  postMessage(FAKE_WORKER_BUSY_MESSAGE);
  burn();
  return Promise.resolve(CANNED_BATCH_RESULT);
}

expose({
  // The key stays on the calling thread; nothing here deserializes it.
  init: () => Promise.resolve(),
  encryptValue,
  encryptValues,
  abort: () => {},
});
postMessage(FAKE_WORKER_READY_MESSAGE);
