import type { GenericLogger } from "@zama-fhe/sdk";

const noop = () => {};

// SDK log messages carry no secrets; the data argument may, so it is never written.
export const diagnosticsLogger: GenericLogger = {
  warn: (message) => {
    process.stderr.write(`${message}\n`);
  },
  error: (message) => {
    process.stderr.write(`${message}\n`);
  },
  info: noop,
  debug: noop,
};
