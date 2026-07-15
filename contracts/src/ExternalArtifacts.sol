// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity 0.8.27;

// Anchor file: pulls in external interfaces this repo needs compiled Forge
// artifacts for (so `pnpm abi:build` can generate their TypeScript ABI), but
// that nothing under `contracts/src` otherwise references directly.
import {IKMSGeneration} from "fhevm-host-contracts/interfaces/IKMSGeneration.sol";

// Forces a real declaration in this compilation unit — an import-only file
// produced a (harmless) "AST source not found" warning from forge's linter.
interface IExternalArtifactsAnchor is IKMSGeneration {}
