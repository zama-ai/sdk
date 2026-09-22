import type { GenericLogger } from "@zama-fhe/sdk";
import { runtimeConfigLockedMessage } from "@zama-fhe/sdk/internal";

const runtimeWarning = `[zama-sdk] ${runtimeConfigLockedMessage}`;
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
