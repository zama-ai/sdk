// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {ConfidentialVault} from "../src/ConfidentialVault.sol";

/// @dev Deploys {ConfidentialVault} bound to an existing ERC-7984 confidential token.
///      Pass the confidential token via the `CONFIDENTIAL_TOKEN` env var, e.g. on Sepolia
///      cUSDC `0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639`.
///
///      forge script script/DeployVault.s.sol \
///        --rpc-url <SEPOLIA_RPC> --private-key <PK> --broadcast
contract DeployVault is Script {
    function run() external {
        address confidentialToken = vm.envAddress("CONFIDENTIAL_TOKEN");

        vm.startBroadcast();
        ConfidentialVault vault = new ConfidentialVault(IERC7984(confidentialToken));
        vm.stopBroadcast();

        console.log("ConfidentialVault:", address(vault));
        console.log("confidentialToken:", confidentialToken);
    }
}
