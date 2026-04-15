// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {TestERC20} from "../src/mocks/Erc20Mintable.sol";
import {ConfidentialWrapper} from "protocol-apps/contracts/confidential-wrapper/contracts/ConfidentialWrapper.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {ConfidentialTokenWrappersRegistry} from "protocol-apps/contracts/confidential-token-wrappers-registry/contracts/ConfidentialTokenWrappersRegistry.sol";

contract Deploy is Script {
    function run() external {
        vm.startBroadcast();

        // 1. Deploy ConfidentialWrapper implementation (for UUPS proxies)
        ConfidentialWrapper wrapperImpl = new ConfidentialWrapper();
        console.log("WrapperImpl:", address(wrapperImpl));

        // 2. Deploy test ERC20 tokens
        TestERC20 usdc = new TestERC20("ERC20 Token", "ERC20", 6);
        console.log("USDC:", address(usdc));

        TestERC20 usdt = new TestERC20("Tether USD", "USDT", 6);
        console.log("USDT:", address(usdt));

        // 3. Deploy wrapper proxies directly
        ConfidentialWrapper cUSDC = _deployWrapper(
            address(wrapperImpl), "Confidential ERC20 Token", "cERC20", IERC20(address(usdc))
        );
        console.log("cUSDC:", address(cUSDC));

        ConfidentialWrapper cUSDT = _deployWrapper(
            address(wrapperImpl), "Confidential Tether USD", "cUSDT", IERC20(address(usdt))
        );
        console.log("cUSDT:", address(cUSDT));

        // 4. Mint 10,000 USDC + 10,000 USDT to deployer (Anvil account #0)
        usdc.mint(msg.sender, 10_000 * 1e6);
        usdt.mint(msg.sender, 10_000 * 1e6);

        // 5. Wrap 1,000 of each into confidential tokens so E2E tests start funded
        uint256 wrapAmount = 1_000 * 1e6;
        IERC20(address(usdc)).approve(address(cUSDC), wrapAmount);
        cUSDC.wrap(msg.sender, wrapAmount);
        IERC20(address(usdt)).approve(address(cUSDT), wrapAmount);
        cUSDT.wrap(msg.sender, wrapAmount);

        // 6. Deploy ConfidentialTokenWrappersRegistry (upgradeable) and register token pairs
        ConfidentialTokenWrappersRegistry registryImpl = new ConfidentialTokenWrappersRegistry();
        bytes memory registryInitData = abi.encodeCall(ConfidentialTokenWrappersRegistry.initialize, (msg.sender));
        ConfidentialTokenWrappersRegistry registry = ConfidentialTokenWrappersRegistry(
            payable(address(new ERC1967Proxy(address(registryImpl), registryInitData)))
        );
        registry.registerConfidentialToken(address(usdc), address(cUSDC));
        registry.registerConfidentialToken(address(usdt), address(cUSDT));
        console.log("WrappersRegistry:", address(registry));

        vm.stopBroadcast();

        // 7. Write deployments.json
        string memory json = "deployments";
        vm.serializeAddress(json, "erc20", address(usdc));
        vm.serializeAddress(json, "cToken", address(cUSDC));
        vm.serializeAddress(json, "USDT", address(usdt));
        vm.serializeAddress(json, "cUSDT", address(cUSDT));
        string memory finalJson = vm.serializeAddress(json, "wrappersRegistry", address(registry));

        string memory path = string.concat(vm.projectRoot(), "/deployments.json");
        vm.writeJson(finalJson, path);
        console.log("Wrote deployments.json");
    }

    function _deployWrapper(
        address implementation,
        string memory name,
        string memory symbol,
        IERC20 underlying
    ) internal returns (ConfidentialWrapper) {
        string memory contractURI = string.concat(
            "data:application/json;utf8,",
            '{"name":"', name, '","symbol":"', symbol, '"}'
        );
        bytes memory initData = abi.encodeCall(
            ConfidentialWrapper.initialize,
            (name, symbol, contractURI, underlying, msg.sender)
        );
        return ConfidentialWrapper(payable(address(new ERC1967Proxy(implementation, initData))));
    }
}
