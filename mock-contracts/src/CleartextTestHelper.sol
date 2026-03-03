// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHEVMExecutor} from "./fhevm-host/contracts/FHEVMExecutor.sol";
import {ACL} from "./fhevm-host/contracts/ACL.sol";
import {FheType} from "./fhevm-host/contracts/shared/FheType.sol";
import {aclAdd, fhevmExecutorAdd} from "./fhevm-host/addresses/FHEVMHostAddresses.sol";

/// @notice Minimal test helper that calls real FHE operations and sets ACL permissions.
/// Used by vitest integration tests to exercise CleartextMockFhevm decrypt paths
/// against real on-chain state.
contract CleartextTestHelper {
    FHEVMExecutor public immutable executor;
    ACL public immutable acl;

    /// @dev Stores the last handles produced, for test readback.
    bytes32[] public lastHandles;

    constructor() {
        executor = FHEVMExecutor(fhevmExecutorAdd);
        acl = ACL(aclAdd);
    }

    /// @notice trivialEncrypt a value, then grant persistent permission to `allowedAddr`
    ///         and mark it for public decryption.
    /// @dev Must be done in one tx so transient permission from trivialEncrypt is active.
    function trivialEncryptAndAllow(
        uint256 value,
        FheType fheType,
        address allowedAddr
    ) external returns (bytes32 handle) {
        handle = executor.trivialEncrypt(value, fheType);
        // transient permission is now active for `address(this)`
        acl.allow(handle, allowedAddr);
        acl.allowForDecryption(_singletonArray(handle));
        lastHandles.push(handle);
    }

    /// @notice Batch trivialEncrypt + allow for multiple values.
    function batchTrivialEncryptAndAllow(
        uint256[] calldata values,
        FheType[] calldata fheTypes,
        address allowedAddr
    ) external returns (bytes32[] memory handles) {
        require(values.length == fheTypes.length, "length mismatch");
        handles = new bytes32[](values.length);

        for (uint256 i = 0; i < values.length; i++) {
            handles[i] = executor.trivialEncrypt(values[i], fheTypes[i]);
            acl.allow(handles[i], allowedAddr);
        }

        // Mark all handles for public decryption
        acl.allowForDecryption(handles);

        // Store for later readback
        for (uint256 i = 0; i < handles.length; i++) {
            lastHandles.push(handles[i]);
        }
    }

    /// @notice fheAdd two trivially encrypted values, allow result, return result handle.
    function testFheAdd(
        uint256 a,
        uint256 b,
        FheType fheType,
        address allowedAddr
    ) external returns (bytes32 result) {
        bytes32 lhs = executor.trivialEncrypt(a, fheType);
        bytes32 rhs = executor.trivialEncrypt(b, fheType);
        result = executor.fheAdd(lhs, rhs, 0x00); // 0x00 = non-scalar

        acl.allow(result, allowedAddr);
        acl.allowForDecryption(_singletonArray(result));

        lastHandles.push(result);
    }

    /// @notice Verify an encrypted input and allow the resulting handle.
    /// @dev Wraps executor.verifyInput() + ACL setup for integration test 8.
    function verifyInputAndAllow(
        bytes32 inputHandle,
        address userAddress,
        bytes calldata inputProof,
        FheType inputType,
        address allowedAddr
    ) external returns (bytes32 result) {
        result = executor.verifyInput(inputHandle, userAddress, inputProof, inputType);
        acl.allow(result, allowedAddr);
        acl.allowForDecryption(_singletonArray(result));
        lastHandles.push(result);
    }

    /// @notice Helper to get handles count.
    function getHandlesCount() external view returns (uint256) {
        return lastHandles.length;
    }

    function _singletonArray(bytes32 value) internal pure returns (bytes32[] memory arr) {
        arr = new bytes32[](1);
        arr[0] = value;
    }
}
