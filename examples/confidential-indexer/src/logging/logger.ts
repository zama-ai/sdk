export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug(message: string): void;
}

export function createLogger(options: { quiet: boolean; verbose: boolean }): Logger {
  const write = (stream: NodeJS.WriteStream, message: string) => {
    if (options.quiet) return;
    stream.write(`${new Date().toISOString()} ${message}\n`);
  };

  return {
    info: (message) => write(process.stdout, `[info] ${message}`),
    warn: (message) => write(process.stderr, `[warn] ${message}`),
    error: (message) => process.stderr.write(`${new Date().toISOString()} [error] ${message}\n`),
    debug: (message) => {
      if (!options.verbose) return;
      write(process.stdout, `[debug] ${message}`);
    },
  };
}
