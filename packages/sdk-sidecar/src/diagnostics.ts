import type { GenericLogger } from "@zama-fhe/sdk";

const runtimeWarning = "[zama-sdk] runtime configuration is already set and cannot be changed.";
const noop = () => {};

export const diagnosticsLogger: GenericLogger = {
  warn: (message) => {
    process.stderr.write(
      `${message === runtimeWarning ? runtimeWarning : "[zama-sdk] warning (details omitted)"}\n`,
    );
  },
  error: () => {
    process.stderr.write("[zama-sdk] error (details omitted)\n");
  },
  info: noop,
  debug: noop,
};
