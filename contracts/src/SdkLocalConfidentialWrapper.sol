// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity 0.8.27;

import {
    ConfidentialWrapper
} from "protocol-apps-wrapper/contracts/confidential-wrapper/contracts/ConfidentialWrapper.sol";
import {
    ERC7984Upgradeable
} from "protocol-apps-wrapper/contracts/confidential-wrapper/contracts/token/ERC7984Upgradeable.sol";
import {
    ERC7984ERC20WrapperUpgradeable
} from "protocol-apps-wrapper/contracts/confidential-wrapper/contracts/extensions/ERC7984ERC20WrapperUpgradeable.sol";

/// @dev Local SDK E2E wrapper aligned with the deployed legacy wrapper ERC-165 ID.
/// The vendored protocol-apps commit computes a transient interface ID from source;
/// SDK tests should exercise the documented deployed baseline instead.
contract SdkLocalConfidentialWrapper is ConfidentialWrapper {
    bytes4 private constant ERC7984_WRAPPER_INTERFACE_ID_LEGACY = 0xd04584ba;

    function supportsInterface(bytes4 interfaceId) public view override(ERC7984ERC20WrapperUpgradeable) returns (bool) {
        return interfaceId == ERC7984_WRAPPER_INTERFACE_ID_LEGACY || ERC7984Upgradeable.supportsInterface(interfaceId);
    }
}
