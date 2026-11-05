// Stand-in for @privy-io/react-auth's optional Solana peer packages (see next.config.ts).
// Privy only reaches them on Solana code paths, which this ethereum-only app never takes.
// CommonJS on purpose: Turbopack validates named imports against ES modules at build time,
// but treats a CommonJS export object as opaque, so Privy's `import { X } from "@solana/kit"`
// compiles and simply yields undefined at runtime.
module.exports = {};
