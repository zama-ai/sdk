// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {TestERC20} from "../src/mocks/Erc20Mintable.sol";
import {DeploymentCoordinator} from "../src/factory/DeploymentCoordinator.sol";
import {ERC7984TransferBatcher} from "../src/batcher/ERC7984TransferBatcher.sol";
import {ConfidentialWrapper} from "../src/wrapper/ERC7984ERC20WrapperUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {WrappersRegistry} from "../src/factory/WrappersRegistry.sol";

contract Deploy is Script {
    function run() external {
        vm.startBroadcast();

        // 1. Deploy ConfidentialWrapper implementation (for UUPS proxies)
        ConfidentialWrapper wrapperImpl = new ConfidentialWrapper();
        console.log("WrapperImpl:", address(wrapperImpl));

        // 2. Deploy DeploymentCoordinator
        DeploymentCoordinator coordinator = new DeploymentCoordinator(address(wrapperImpl));
        console.log("Coordinator:", address(coordinator));

        // 3. Deploy test ERC20 tokens
        TestERC20 usdc = new TestERC20("ERC20 Token", "ERC20", 6);
        console.log("USDC:", address(usdc));

        TestERC20 usdt = new TestERC20("Tether USD", "USDT", 6);
        console.log("USDT:", address(usdt));

        // 4. Deploy wrapper pairs via coordinator
        ConfidentialWrapper cUSDC = coordinator.deploy(address(usdc));
        console.log("cUSDC:", address(cUSDC));

        ConfidentialWrapper cUSDT = coordinator.deploy(address(usdt));
        console.log("cUSDT:", address(cUSDT));

        // 5. Deploy TransferBatcher
        ERC7984TransferBatcher batcher = new ERC7984TransferBatcher();
        console.log("TransferBatcher:", address(batcher));

        // 6. Mint 10,000 USDC + 10,000 USDT to deployer (Anvil account #0)
        usdc.mint(msg.sender, 10_000 * 1e6);
        usdt.mint(msg.sender, 10_000 * 1e6);

        // 7. Wrap 1,000 of each into confidential tokens so E2E tests start funded
        uint256 wrapAmount = 1_000 * 1e6;
        IERC20(address(usdc)).approve(address(cUSDC), wrapAmount);
        cUSDC.wrap(msg.sender, wrapAmount);
        IERC20(address(usdt)).approve(address(cUSDT), wrapAmount);
        cUSDT.wrap(msg.sender, wrapAmount);

        // 8. Deploy WrappersRegistry and register token pairs
        WrappersRegistry registry = new WrappersRegistry();
        registry.registerPair(address(usdc), address(cUSDC));
        registry.registerPair(address(usdt), address(cUSDT));
        console.log("WrappersRegistry:", address(registry));

        vm.stopBroadcast();

        // 9. Write deployments.json
        string memory json = "deployments";
        vm.serializeAddress(json, "erc20", address(usdc));
        vm.serializeAddress(json, "cToken", address(cUSDC));
        vm.serializeAddress(json, "USDT", address(usdt));
        vm.serializeAddress(json, "cUSDT", address(cUSDT));
        vm.serializeAddress(json, "transferBatcher", address(batcher));
        string memory finalJson = vm.serializeAddress(json, "wrappersRegistry", address(registry));

        string memory path = string.concat(vm.projectRoot(), "/deployments.json");
        vm.writeJson(finalJson, path);
        console.log("Wrote deployments.json");
    }
}
