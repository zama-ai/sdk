// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

contract MockInputVerifier {
    struct ContextUserInputs {
        address userAddress;
        address contractAddress;
    }

    function verifyInput(ContextUserInputs memory, bytes32 inputHandle, bytes memory) external pure returns (bytes32) {
        return inputHandle;
    }
}
