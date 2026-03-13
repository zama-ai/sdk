// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {TestERC20} from "../src/mocks/Erc20Mintable.sol";
import {FeeManager} from "../src/admin/FeeManager.sol";
import {SanctionsList} from "../src/admin/SanctionsList.sol";
import {AdminProvider} from "../src/admin/AdminProvider.sol";
import {DeploymentCoordinator} from "../src/factory/DeploymentCoordinator.sol";
import {ERC7984TransferBatcher} from "../src/batcher/ERC7984TransferBatcher.sol";
import {ConfidentialWrapper} from "../src/wrapper/ERC7984ERC20WrapperUpgradeable.sol";

contract Deploy is Script {
    function run() external {
        vm.startBroadcast();

        // 1. Deploy SanctionsList
        SanctionsList sanctionsList = new SanctionsList();
        console.log("SanctionsList:", address(sanctionsList));

        // 2. Deploy FeeManager (zero fees for tests)
        FeeManager feeManager = new FeeManager(0, 0, 0, 0, msg.sender);
        console.log("FeeManager:", address(feeManager));

        // 3. Deploy AdminProvider
        AdminProvider adminProvider = new AdminProvider(feeManager, sanctionsList, msg.sender);
        console.log("AdminProvider:", address(adminProvider));

        // 4. Deploy ConfidentialWrapper implementation (for UUPS proxies)
        ConfidentialWrapper wrapperImpl = new ConfidentialWrapper();
        console.log("WrapperImpl:", address(wrapperImpl));

        // 5. Deploy DeploymentCoordinator
        DeploymentCoordinator coordinator = new DeploymentCoordinator(adminProvider, address(wrapperImpl));
        console.log("Coordinator:", address(coordinator));

        // 6. Deploy test ERC20 tokens
        TestERC20 usdc = new TestERC20("USD Coin", "USDC", 6);
        console.log("USDC:", address(usdc));

        TestERC20 usdt = new TestERC20("Tether USD", "USDT", 6);
        console.log("USDT:", address(usdt));

        // 7. Deploy wrapper pairs via coordinator
        ConfidentialWrapper cUSDC = coordinator.deploy(address(usdc));
        console.log("cUSDC:", address(cUSDC));

        ConfidentialWrapper cUSDT = coordinator.deploy(address(usdt));
        console.log("cUSDT:", address(cUSDT));

        // 8. Deploy TransferBatcher
        ERC7984TransferBatcher batcher = new ERC7984TransferBatcher(adminProvider);
        console.log("TransferBatcher:", address(batcher));

        // 9. Mint 10,000 USDC + 10,000 USDT to deployer (Anvil account #0)
        usdc.mint(msg.sender, 10_000 * 1e6);
        usdt.mint(msg.sender, 10_000 * 1e6);

        vm.stopBroadcast();

        // 10. Write deployments.json
        string memory json = "deployments";
        vm.serializeAddress(json, "erc20", address(usdc));
        vm.serializeAddress(json, "cToken", address(cUSDC));
        vm.serializeAddress(json, "USDT", address(usdt));
        vm.serializeAddress(json, "cUSDT", address(cUSDT));
        vm.serializeAddress(json, "transferBatcher", address(batcher));
        string memory finalJson = vm.serializeAddress(json, "feeManager", address(feeManager));

        string memory path = string.concat(vm.projectRoot(), "/deployments.json");
        vm.writeJson(finalJson, path);
        console.log("Wrote deployments.json");
    }
}
