// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {IACL} from "@fhevm/solidity/lib/Impl.sol";

/// @dev Local extension of the vendored `IACL` interface. Imports from the exact same
///      `Impl.sol` (the fhevm-solidity dependency) that `contracts/out/Impl.sol/IACL.json` already
///      compiles from — deliberately *not* the newer `fhevm/host-contracts/lib/Impl.sol` submodule,
///      whose `IACL` has drifted further from this one (it additionally declares
///      `getConfidentialBridgeAddress`, which this repo's ABI doesn't currently expose) — so this
///      extension changes nothing about the other 13 functions and adds exactly the one
///      decryption-signature invalidation declaration this repo's SDK actually calls. `ACL.sol`
///      also exposes a matching read-only getter for the invalidation cutoff, but nothing in this
///      repo calls it yet, so it's left off this local stopgap — add it here if/when a caller
///      needs it.
///
///      `IACL` itself doesn't declare this function upstream yet. Once it does and this repo's
///      `fhevm` submodule pin includes it, delete this file and point `scripts/abi/build.mjs`'s
///      ACL target back at `contracts/out/Impl.sol/IACL.json`.
interface IACLExtended is IACL {
    /// @notice Invalidates every decryption signature signed by `msg.sender` before `timestamp`.
    /// @param timestamp Oldest timestamp that remains valid. Passing 0 resolves to the current
    ///        block timestamp.
    function invalidateDecryptionSignaturesBefore(uint256 timestamp) external;
}
