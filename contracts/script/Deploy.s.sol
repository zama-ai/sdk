// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {TestERC20} from "../src/mocks/Erc20Mintable.sol";
import {TestERC1363} from "../src/mocks/Erc1363Mintable.sol";
import {ConfidentialWrapper} from "protocol-apps-wrapper/contracts/confidential-wrapper/contracts/ConfidentialWrapper.sol";
import {ConfidentialWrapperV3} from
    "protocol-apps-wrapper/contracts/confidential-wrapper/contracts/upgrades/ConfidentialWrapperV3.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {ConfidentialTokenWrappersRegistry} from "protocol-apps-registry/contracts/confidential-token-wrappers-registry/contracts/ConfidentialTokenWrappersRegistry.sol";

contract Deploy is Script {
    function run() external {
        vm.startBroadcast();

        // 1. Deploy ConfidentialWrapperV3 implementation (for UUPS proxies).
        // V3 matches what's live on mainnet and sepolia (zama-ai/protocol-apps@main),
        // and exposes the owner-controlled denylist surface (blockUser/unblockUser/isBlocked).
        ConfidentialWrapperV3 wrapperImpl = new ConfidentialWrapperV3();
        console.log("WrapperImpl:", address(wrapperImpl));

        // 2. Deploy test ERC20 tokens
        TestERC20 usdc = new TestERC20("ERC20 Token", "ERC20", 6);
        console.log("USDC:", address(usdc));

        TestERC20 usdt = new TestERC20("Tether USD", "USDT", 6);
        console.log("USDT:", address(usdt));

        // 3. Deploy wrapper proxies directly
        ConfidentialWrapperV3 cUSDC = _deployWrapper(
            address(wrapperImpl), "Confidential ERC20 Token", "cERC20", IERC20(address(usdc))
        );
        console.log("cUSDC:", address(cUSDC));

        ConfidentialWrapperV3 cUSDT = _deployWrapper(
            address(wrapperImpl), "Confidential Tether USD", "cUSDT", IERC20(address(usdt))
        );
        console.log("cUSDT:", address(cUSDT));

        // 3b. Deploy ERC-1363 test token + wrapper (for transferAndCall e2e tests)
        TestERC1363 erc1363Token = new TestERC1363("ERC1363 Token", "ERC1363", 6);
        console.log("ERC1363:", address(erc1363Token));

        ConfidentialWrapperV3 cERC1363 = _deployWrapper(
            address(wrapperImpl), "Confidential ERC1363 Token", "cERC1363", IERC20(address(erc1363Token))
        );
        console.log("cERC1363:", address(cERC1363));

        // 4. Mint 10,000 USDC + 10,000 USDT + 10,000 ERC1363 to deployer (Anvil account #0)
        usdc.mint(msg.sender, 10_000 * 1e6);
        usdt.mint(msg.sender, 10_000 * 1e6);
        erc1363Token.mint(msg.sender, 10_000 * 1e6);

        // 5. Wrap 1,000 of each into confidential tokens so E2E tests start funded
        uint256 wrapAmount = 1_000 * 1e6;
        IERC20(address(usdc)).approve(address(cUSDC), wrapAmount);
        cUSDC.wrap(msg.sender, wrapAmount);
        IERC20(address(usdt)).approve(address(cUSDT), wrapAmount);
        cUSDT.wrap(msg.sender, wrapAmount);
        IERC20(address(erc1363Token)).approve(address(cERC1363), wrapAmount);
        cERC1363.wrap(msg.sender, wrapAmount);

        // 6. Deploy ConfidentialTokenWrappersRegistry (upgradeable) and register token pairs
        ConfidentialTokenWrappersRegistry registryImpl = new ConfidentialTokenWrappersRegistry();
        bytes memory registryInitData = abi.encodeCall(ConfidentialTokenWrappersRegistry.initialize, (msg.sender));
        ConfidentialTokenWrappersRegistry registry = ConfidentialTokenWrappersRegistry(
            payable(address(new ERC1967Proxy(address(registryImpl), registryInitData)))
        );
        registry.registerConfidentialToken(address(usdc), address(cUSDC));
        registry.registerConfidentialToken(address(usdt), address(cUSDT));
        registry.registerConfidentialToken(address(erc1363Token), address(cERC1363));
        console.log("WrappersRegistry:", address(registry));

        // 7. Bring each proxy to V3 storage so denylist admin (blockUser/unblockUser/isBlocked)
        // and V3 denylist enforcement on transfer/wrap/unwrap are active in tests. Empty initial
        // denylist; no underlying denylist selector configured.
        // Deferred to the end of broadcast so that no transaction is inserted between contract
        // creations — keeps every CREATE address identical to the pre-V3 deploy script, which
        // matters because `contracts/deployments.json` is checked in and consumed at build time
        // by test-nextjs/test-vite.
        cUSDC.reinitializeV3(new address[](0), bytes4(0), false);
        cUSDT.reinitializeV3(new address[](0), bytes4(0), false);
        cERC1363.reinitializeV3(new address[](0), bytes4(0), false);

        vm.stopBroadcast();

        // 8. Write deployments.json
        string memory json = "deployments";
        vm.serializeAddress(json, "erc20", address(usdc));
        vm.serializeAddress(json, "cToken", address(cUSDC));
        vm.serializeAddress(json, "USDT", address(usdt));
        vm.serializeAddress(json, "cUSDT", address(cUSDT));
        vm.serializeAddress(json, "ERC1363", address(erc1363Token));
        vm.serializeAddress(json, "cERC1363", address(cERC1363));
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
    ) internal returns (ConfidentialWrapperV3) {
        string memory contractURI = string.concat(
            "data:application/json;utf8,",
            '{"name":"', name, '","symbol":"', symbol, '"}'
        );
        bytes memory initData = abi.encodeCall(
            ConfidentialWrapper.initialize,
            (name, symbol, contractURI, underlying, msg.sender)
        );
        return ConfidentialWrapperV3(payable(address(new ERC1967Proxy(implementation, initData))));
    }
}
