// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {Test} from "forge-std/Test.sol";

import {CleartextFHEVMExecutor} from "../src/CleartextFHEVMExecutor.sol";
import {FHEVMExecutor} from "../src/fhevm-host/contracts/FHEVMExecutor.sol";
import {FheType} from "../src/fhevm-host/contracts/shared/FheType.sol";
import {aclAdd, hcuLimitAdd, inputVerifierAdd} from "../src/fhevm-host/addresses/FHEVMHostAddresses.sol";
import {MockACL} from "./mocks/MockACL.sol";
import {MockHCULimit} from "./mocks/MockHCULimit.sol";
import {MockInputVerifier} from "./mocks/MockInputVerifier.sol";

contract CleartextFHEVMExecutorTest is Test {
    CleartextFHEVMExecutor internal executor;

    function setUp() public {
        // Uses mock contracts as the purpose of this test is to purely test the arithmetic behavior of the CleartextFHEVMExecutor contract.
        MockACL acl = new MockACL();
        MockHCULimit hcuLimit = new MockHCULimit();
        MockInputVerifier inputVerifier = new MockInputVerifier();

        vm.etch(aclAdd, address(acl).code);
        vm.etch(hcuLimitAdd, address(hcuLimit).code);
        vm.etch(inputVerifierAdd, address(inputVerifier).code);

        executor = new CleartextFHEVMExecutor();
    }

    function _encryptU8(uint256 value) internal returns (bytes32) {
        return executor.trivialEncrypt(value, FheType.Uint8);
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

    function test_fheMul_wrapsOnOverflow() public {
        bytes32 a = _encryptU8(20);
        bytes32 b = _encryptU8(15);
        bytes32 result = executor.fheMul(a, b, 0x00);
        assertEq(executor.plaintexts(result), 44);
    }

    function test_fheDiv_scalar() public {
        bytes32 a = _encryptU8(201);
        bytes32 result = executor.fheDiv(a, bytes32(uint256(10)), 0x01);
        assertEq(executor.plaintexts(result), 20);
    }

    function test_fheDiv_revertsWhenRhsIsCiphertext() public {
        bytes32 a = _encryptU8(201);
        bytes32 b = _encryptU8(10);
        vm.expectRevert(FHEVMExecutor.IsNotScalar.selector);
        executor.fheDiv(a, b, 0x00);
    }

    function test_fheDiv_revertsOnDivisionByZero() public {
        bytes32 a = _encryptU8(201);
        vm.expectRevert(FHEVMExecutor.DivisionByZero.selector);
        executor.fheDiv(a, bytes32(uint256(0)), 0x01);
    }

    function test_fheRem_scalar() public {
        bytes32 a = _encryptU8(201);
        bytes32 result = executor.fheRem(a, bytes32(uint256(10)), 0x01);
        assertEq(executor.plaintexts(result), 1);
    }

    function test_fheRem_revertsOnDivisionByZero() public {
        bytes32 a = _encryptU8(201);
        vm.expectRevert(FHEVMExecutor.DivisionByZero.selector);
        executor.fheRem(a, bytes32(uint256(0)), 0x01);
    }

    function test_fheBitAnd_masksResult() public {
        bytes32 a = _encryptU8(0xF0);
        bytes32 b = _encryptU8(0xCC);
        bytes32 result = executor.fheBitAnd(a, b, 0x00);
        assertEq(executor.plaintexts(result), 0xC0);
    }

    function test_fheBitOr_masksResult() public {
        bytes32 a = _encryptU8(0xF0);
        bytes32 b = _encryptU8(0x0C);
        bytes32 result = executor.fheBitOr(a, b, 0x00);
        assertEq(executor.plaintexts(result), 0xFC);
    }

    function test_fheBitXor_masksResult() public {
        bytes32 a = _encryptU8(0xAA);
        bytes32 b = _encryptU8(0x0F);
        bytes32 result = executor.fheBitXor(a, b, 0x00);
        assertEq(executor.plaintexts(result), 0xA5);
    }

    function test_fheShl_usesModuloShiftWidth() public {
        bytes32 a = _encryptU8(0x03);
        bytes32 b = _encryptU8(10);
        bytes32 result = executor.fheShl(a, b, 0x00);
        assertEq(executor.plaintexts(result), 0x0C);
    }

    function test_fheShr_usesModuloShiftWidth() public {
        bytes32 a = _encryptU8(0x80);
        bytes32 b = _encryptU8(9);
        bytes32 result = executor.fheShr(a, b, 0x00);
        assertEq(executor.plaintexts(result), 0x40);
    }

    function test_fheRotl_rotatesBits() public {
        bytes32 a = _encryptU8(0x81);
        bytes32 b = _encryptU8(1);
        bytes32 result = executor.fheRotl(a, b, 0x00);
        assertEq(executor.plaintexts(result), 0x03);
    }

    function test_fheRotr_rotatesBits() public {
        bytes32 a = _encryptU8(0x81);
        bytes32 b = _encryptU8(2);
        bytes32 result = executor.fheRotr(a, b, 0x00);
        assertEq(executor.plaintexts(result), 0x60);
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

    function test_fheNe_storesBoolean() public {
        bytes32 a = _encryptU8(42);
        bytes32 b = _encryptU8(99);
        bytes32 ne = executor.fheNe(a, b, 0x00);
        assertEq(executor.plaintexts(ne), 1);
    }

    function test_fheGe_storesBoolean() public {
        bytes32 a = _encryptU8(42);
        bytes32 b = _encryptU8(20);
        bytes32 result = executor.fheGe(a, b, 0x00);
        assertEq(executor.plaintexts(result), 1);
    }

    function test_fheGt_storesBoolean() public {
        bytes32 a = _encryptU8(42);
        bytes32 b = _encryptU8(42);
        bytes32 result = executor.fheGt(a, b, 0x00);
        assertEq(executor.plaintexts(result), 0);
    }

    function test_fheLe_storesBoolean() public {
        bytes32 a = _encryptU8(11);
        bytes32 b = _encryptU8(42);
        bytes32 result = executor.fheLe(a, b, 0x00);
        assertEq(executor.plaintexts(result), 1);
    }

    function test_fheLt_storesBoolean() public {
        bytes32 a = _encryptU8(42);
        bytes32 b = _encryptU8(11);
        bytes32 result = executor.fheLt(a, b, 0x00);
        assertEq(executor.plaintexts(result), 0);
    }

    function test_fheMin_returnsSmallerOperand() public {
        bytes32 a = _encryptU8(42);
        bytes32 b = _encryptU8(11);
        bytes32 result = executor.fheMin(a, b, 0x00);
        assertEq(executor.plaintexts(result), 11);
    }

    function test_fheMax_returnsLargerOperand() public {
        bytes32 a = _encryptU8(42);
        bytes32 b = _encryptU8(11);
        bytes32 result = executor.fheMax(a, b, 0x00);
        assertEq(executor.plaintexts(result), 42);
    }

    function test_fheNeg_twosComplementWithinBitWidth() public {
        bytes32 a = _encryptU8(5);
        bytes32 result = executor.fheNeg(a);
        assertEq(executor.plaintexts(result), 251);
    }

    function test_fheIfThenElse_returnsTrueBranch() public {
        bytes32 control = executor.trivialEncrypt(1, FheType.Bool);
        bytes32 ifTrue = _encryptU8(7);
        bytes32 ifFalse = _encryptU8(9);
        bytes32 result = executor.fheIfThenElse(control, ifTrue, ifFalse);
        assertEq(executor.plaintexts(result), 7);
    }

    function test_fheIfThenElse_returnsFalseBranch() public {
        bytes32 control = executor.trivialEncrypt(0, FheType.Bool);
        bytes32 ifTrue = _encryptU8(7);
        bytes32 ifFalse = _encryptU8(9);
        bytes32 result = executor.fheIfThenElse(control, ifTrue, ifFalse);
        assertEq(executor.plaintexts(result), 9);
    }

    function test_cast_clampsToNewType() public {
        bytes32 a = executor.trivialEncrypt(300, FheType.Uint16);
        bytes32 result = executor.cast(a, FheType.Uint8);
        assertEq(executor.plaintexts(result), 44);
    }

    function test_cast_clampsUint256ToUint128() public {
        bytes32 a = executor.trivialEncrypt(type(uint256).max, FheType.Uint256);
        bytes32 result = executor.cast(a, FheType.Uint128);
        assertEq(executor.plaintexts(result), type(uint128).max);
    }

    function test_fheRand_storesDeterministicValue() public {
        vm.roll(block.number + 1);
        vm.warp(block.timestamp + 1);

        bytes16 expectedSeed = bytes16(
            keccak256(abi.encodePacked(uint256(0), aclAdd, block.chainid, blockhash(block.number - 1), block.timestamp))
        );
        uint256 expected = uint256(keccak256(abi.encodePacked(expectedSeed, "randValue"))) & 0xFF;

        bytes32 result = executor.fheRand(FheType.Uint8);
        assertEq(executor.plaintexts(result), expected);
    }

    function test_fheRandBounded_storesValueBelowUpperBound() public {
        vm.roll(block.number + 1);
        vm.warp(block.timestamp + 1);

        uint256 upperBound = 16;
        bytes16 expectedSeed = bytes16(
            keccak256(abi.encodePacked(uint256(0), aclAdd, block.chainid, blockhash(block.number - 1), block.timestamp))
        );
        uint256 expected = uint256(keccak256(abi.encodePacked(expectedSeed, "randBoundedValue"))) % upperBound;

        bytes32 result = executor.fheRandBounded(upperBound, FheType.Uint8);
        assertEq(executor.plaintexts(result), expected);
    }

    function test_fheRandBounded_revertsWhenUpperBoundNotPowerOfTwo() public {
        vm.expectRevert(FHEVMExecutor.NotPowerOfTwo.selector);
        executor.fheRandBounded(15, FheType.Uint8);
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

    function test_verifyInput_ignoresCleartextsWhenHandleIsNotPresent() public {
        bytes32 handle0 = executor.trivialEncrypt(1, FheType.Uint8);
        bytes32 handle1 = executor.trivialEncrypt(2, FheType.Uint8);
        bytes32 missingHandle = executor.trivialEncrypt(3, FheType.Uint8);
        bytes32 queryHandle = missingHandle ^ bytes32(uint256(1) << 248);

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

        bytes32 result = executor.verifyInput(queryHandle, address(this), proof, FheType.Uint8);

        assertEq(result, queryHandle);
        assertEq(executor.plaintexts(result), 0);
    }

    function test_fheNot_masksCorrectly() public {
        bytes32 a = executor.trivialEncrypt(0x0F, FheType.Uint8);
        bytes32 result = executor.fheNot(a);
        assertEq(executor.plaintexts(result), 0xF0);
    }
}
