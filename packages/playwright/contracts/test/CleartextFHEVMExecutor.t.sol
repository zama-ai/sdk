// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {Test} from "forge-std/Test.sol";

import {CleartextFHEVMExecutor} from "../src/CleartextFHEVMExecutor.sol";
import {FheType} from "../src/fhevm-host/contracts/shared/FheType.sol";
import {aclAdd, hcuLimitAdd, inputVerifierAdd} from "../src/fhevm-host/addresses/FHEVMHostAddresses.sol";
import {MockACL} from "./mocks/MockACL.sol";
import {MockHCULimit} from "./mocks/MockHCULimit.sol";
import {MockInputVerifier} from "./mocks/MockInputVerifier.sol";

contract CleartextFHEVMExecutorTest is Test {
    CleartextFHEVMExecutor internal executor;

    function setUp() public {
        MockACL acl = new MockACL();
        MockHCULimit hcuLimit = new MockHCULimit();
        MockInputVerifier inputVerifier = new MockInputVerifier();

        vm.etch(aclAdd, address(acl).code);
        vm.etch(hcuLimitAdd, address(hcuLimit).code);
        vm.etch(inputVerifierAdd, address(inputVerifier).code);

        executor = new CleartextFHEVMExecutor();
    }

    function test_trivialEncrypt_storesPlaintext() public {
        bytes32 result = executor.trivialEncrypt(42, FheType.Uint8);
        assertEq(executor.plaintexts(result), 42);
    }

    function test_fheAdd_computesSum() public {
        bytes32 a = executor.trivialEncrypt(10, FheType.Uint8);
        bytes32 b = executor.trivialEncrypt(20, FheType.Uint8);
        bytes32 result = executor.fheAdd(a, b, 0x00);
        assertEq(executor.plaintexts(result), 30);
    }

    function test_fheAdd_scalar() public {
        bytes32 a = executor.trivialEncrypt(10, FheType.Uint8);
        bytes32 result = executor.fheAdd(a, bytes32(uint256(20)), 0x01);
        assertEq(executor.plaintexts(result), 30);
    }

    function test_fheSub_wrapsOnUnderflow() public {
        bytes32 a = executor.trivialEncrypt(5, FheType.Uint8);
        bytes32 b = executor.trivialEncrypt(10, FheType.Uint8);
        bytes32 result = executor.fheSub(a, b, 0x00);
        assertEq(executor.plaintexts(result), 251);
    }

    function test_fheEq_storesBoolean() public {
        bytes32 a = executor.trivialEncrypt(42, FheType.Uint8);
        bytes32 b = executor.trivialEncrypt(42, FheType.Uint8);
        bytes32 equal = executor.fheEq(a, b, 0x00);
        assertEq(executor.plaintexts(equal), 1);

        bytes32 c = executor.trivialEncrypt(99, FheType.Uint8);
        bytes32 notEqual = executor.fheEq(a, c, 0x00);
        assertEq(executor.plaintexts(notEqual), 0);
    }

    function test_cast_clampsToNewType() public {
        bytes32 a = executor.trivialEncrypt(300, FheType.Uint16);
        bytes32 result = executor.cast(a, FheType.Uint8);
        assertEq(executor.plaintexts(result), 44);
    }

    function test_fheRand_storesDeterministicValue() public {
        vm.roll(block.number + 1);
        vm.warp(block.timestamp + 1);

        bytes32 result = executor.fheRand(FheType.Uint8);
        assertLe(executor.plaintexts(result), 255);
    }

    function test_verifyInput_extractsCleartext() public {
        bytes32 handle0 = executor.trivialEncrypt(1, FheType.Uint8);
        bytes32 handle1 = executor.trivialEncrypt(2, FheType.Uint8);

        bytes memory signatures = new bytes(65);
        bytes memory proof = abi.encodePacked(
            uint8(2),
            uint8(1),
            handle0,
            handle1,
            signatures,
            bytes32(uint256(111)),
            bytes32(uint256(222))
        );

        bytes32 result = executor.verifyInput(handle1, address(this), proof, FheType.Uint8);

        assertEq(result, handle1);
        assertEq(executor.plaintexts(result), 222);
    }

    function test_fheNot_masksCorrectly() public {
        bytes32 a = executor.trivialEncrypt(0x0F, FheType.Uint8);
        bytes32 result = executor.fheNot(a);
        assertEq(executor.plaintexts(result), 0xF0);
    }
}
