// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {FhevmTest} from "forge-fhevm/FhevmTest.sol";

import {euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {ERC7984Mock} from "@openzeppelin/confidential-contracts/mocks/token/ERC7984Mock.sol";

import {ConfidentialVault} from "../src/ConfidentialVault.sol";

/// @dev Coverage for the ConfidentialVault example: the `confidentialTransferAndCall` deposit
///      callback, beneficiary crediting/accumulation, the zero-beneficiary atomic refund, the
///      anti-spoof guard, and `withdraw()` (funds returned + slot cleared to the empty sentinel).
///      Runs against the forge-fhevm cleartext harness (chainid 31337 == `_getLocalConfig`).
contract ConfidentialVaultTest is FhevmTest {
    uint256 internal constant HOLDER_PK = 0xA11CE;
    uint256 internal constant ALICE_PK = 0xB0B;
    uint256 internal constant STRANGER_PK = 0xCAFE;

    bytes32 internal constant EMPTY = bytes32(0);
    uint64 internal constant MINT = 1000;

    ERC7984Mock internal token;
    ConfidentialVault internal vault;

    address internal holder;
    address internal alice;
    address internal stranger;

    function setUp() public override {
        super.setUp();

        holder = vm.addr(HOLDER_PK);
        alice = vm.addr(ALICE_PK);
        stranger = vm.addr(STRANGER_PK);

        token = new ERC7984Mock("Confidential Mock", "cMOCK", "https://example.com");
        vault = new ConfidentialVault(IERC7984(address(token)));

        token.$_mint(holder, MINT);
    }

    // ── Wiring ──────────────────────────────────────────────────────────────

    function test_constructor_bindsToken() public view {
        assertEq(address(vault.confidentialToken()), address(token));
    }

    // ── Deposit (confidentialTransferAndCall) ───────────────────────────────

    function test_deposit_creditsBeneficiaryAndDebitsDepositor() public {
        _deposit(HOLDER_PK, 400, holder);

        assertEq(_decryptShares(HOLDER_PK, holder), 400);
        assertEq(_decryptBalance(HOLDER_PK, holder), 600);
    }

    function test_deposit_creditsADifferentBeneficiary() public {
        _deposit(HOLDER_PK, 400, alice);

        assertEq(_decryptShares(ALICE_PK, alice), 400);
        assertEq(_decryptBalance(HOLDER_PK, holder), 600);
        // The depositor holds no position of their own.
        assertEq(euint64.unwrap(vault.sharesOf(holder)), EMPTY);
    }

    function test_deposit_accumulatesAcrossDeposits() public {
        _deposit(HOLDER_PK, 300, alice);
        _deposit(HOLDER_PK, 200, alice);

        assertEq(_decryptShares(ALICE_PK, alice), 500);
        assertEq(_decryptBalance(HOLDER_PK, holder), 500);
    }

    function test_deposit_emitsDepositEvent() public {
        (externalEuint64 ext, bytes memory proof) = encryptUint64(100, holder, address(token));

        vm.expectEmit(true, true, false, false, address(vault));
        emit ConfidentialVault.Deposit(holder, alice);

        vm.prank(holder);
        token.confidentialTransferAndCall(address(vault), ext, proof, abi.encode(alice));
    }

    // ── Zero-beneficiary atomic refund ──────────────────────────────────────

    function test_deposit_zeroBeneficiary_refundsAtomically() public {
        _deposit(HOLDER_PK, 400, address(0));

        // The receiver returned encrypted `false`, so the token reverses the transfer:
        // the depositor's balance is whole again and nothing was credited.
        assertEq(_decryptBalance(HOLDER_PK, holder), 1000);
        assertEq(euint64.unwrap(vault.sharesOf(address(0))), EMPTY);
    }

    // ── Anti-spoof guard ────────────────────────────────────────────────────

    function test_onReceived_revertsForUnauthorizedCaller() public {
        // A direct caller that is not the bound token cannot forge a credit.
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(ConfidentialVault.UnauthorizedToken.selector, stranger));
        vault.onConfidentialTransferReceived(stranger, holder, euint64.wrap(EMPTY), abi.encode(alice));
    }

    // ── Withdraw (returns funds + clears slot to the empty sentinel) ─────────

    function test_withdraw_returnsFundsAndClearsSlot() public {
        _deposit(HOLDER_PK, 400, holder);
        assertEq(_decryptBalance(HOLDER_PK, holder), 600);

        vm.prank(holder);
        vault.withdraw();

        // Funds are back with the holder…
        assertEq(_decryptBalance(HOLDER_PK, holder), 1000);
        // …and the slot is the uninitialized bytes32(0) sentinel (UI reads "no position").
        assertEq(euint64.unwrap(vault.sharesOf(holder)), EMPTY);
    }

    function test_withdraw_emitsWithdrawEvent() public {
        _deposit(HOLDER_PK, 250, holder);

        vm.expectEmit(true, false, false, false, address(vault));
        emit ConfidentialVault.Withdraw(holder);

        vm.prank(holder);
        vault.withdraw();
    }

    function test_withdraw_repeatReverts() public {
        _deposit(HOLDER_PK, 400, holder);

        vm.prank(holder);
        vault.withdraw();

        // The cleared slot is uninitialized, so the guard now reverts a second withdraw.
        vm.prank(holder);
        vm.expectRevert(abi.encodeWithSelector(ConfidentialVault.NothingToWithdraw.selector, holder));
        vault.withdraw();
    }

    function test_withdraw_withoutPositionReverts() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(ConfidentialVault.NothingToWithdraw.selector, stranger));
        vault.withdraw();
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    /// @notice Deposits `amount` into the vault crediting `beneficiary`, via the AndCall callback.
    function _deposit(uint256 signerPk, uint64 amount, address beneficiary) internal {
        address signer = vm.addr(signerPk);
        (externalEuint64 ext, bytes memory proof) = encryptUint64(amount, signer, address(token));
        vm.prank(signer);
        token.confidentialTransferAndCall(address(vault), ext, proof, abi.encode(beneficiary));
    }

    /// @notice Decrypts `account`'s vault position (ACL granted to both the holder and the vault).
    function _decryptShares(uint256 pk, address account) internal returns (uint64) {
        bytes memory sig = signUserDecrypt(pk, address(vault));
        return uint64(userDecrypt(euint64.unwrap(vault.sharesOf(account)), account, address(vault), sig));
    }

    /// @notice Decrypts `account`'s confidential token balance.
    function _decryptBalance(uint256 pk, address account) internal returns (uint64) {
        bytes memory sig = signUserDecrypt(pk, address(token));
        return uint64(userDecrypt(euint64.unwrap(token.confidentialBalanceOf(account)), account, address(token), sig));
    }
}
