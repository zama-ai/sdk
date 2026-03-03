// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {Test} from "forge-std/Test.sol";
import {FheTypeBitWidth} from "../src/FheTypeBitWidth.sol";
import {FheType} from "../src/fhevm-host/contracts/shared/FheType.sol";

contract FheTypeBitWidthHarness {
    function bitWidth(FheType fheType) external pure returns (uint256) {
        return FheTypeBitWidth.bitWidthForType(uint8(fheType));
    }

    function bitWidthRaw(uint8 typeId) external pure returns (uint256) {
        return FheTypeBitWidth.bitWidthForType(typeId);
    }
}

contract FheTypeBitWidthTest is Test {
    FheTypeBitWidthHarness internal harness;

    function setUp() public {
        harness = new FheTypeBitWidthHarness();
    }

    function test_bitWidthForType_supportsExtendedUintAndIntTypes() public view {
        assertEq(harness.bitWidth(FheType.Bool), 1);
        assertEq(harness.bitWidth(FheType.Uint248), 248);
        assertEq(harness.bitWidth(FheType.Uint2048), 2048);
        assertEq(harness.bitWidth(FheType.Int24), 24);
        assertEq(harness.bitWidth(FheType.Int2048), 2048);
    }

    function test_bitWidthForType_revertsWithUnsupportedType() public {
        vm.expectRevert(abi.encodeWithSignature("UnsupportedType()"));
        harness.bitWidthRaw(uint8(FheType.AsciiString));
    }
}
