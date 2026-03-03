// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

/// @notice Minimal mock InputVerifier that passes any input through.
/// Returns the inputHandle as-is, skipping signature verification.
/// Used only in integration tests with a raw anvil node.
contract MockInputVerifier {
    struct ContextUserInputs {
        address userAddress;
        address contractAddress;
    }

    function verifyInput(
        ContextUserInputs memory,
        bytes32 inputHandle,
        bytes memory
    ) external pure returns (bytes32) {
        return inputHandle;
    }
}
