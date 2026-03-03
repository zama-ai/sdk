// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

contract MockACL {
    function isAllowed(bytes32, address) external pure returns (bool) {
        return true;
    }

    function allowTransient(bytes32, address) external pure {}

    function owner() external pure returns (address) {
        return address(0x1234);
    }
}
