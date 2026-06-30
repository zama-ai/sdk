// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {FHE, ebool, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {IERC7984Receiver} from "@openzeppelin/confidential-contracts/interfaces/IERC7984Receiver.sol";

/// @dev Minimal confidential escrow vault demonstrating the ERC-7984 `confidentialTransferAndCall`
///      receiver-callback pattern. A depositor moves confidential tokens into the vault in a single
///      transaction; `data` carries the beneficiary to credit. The beneficiary withdraws later.
///      Illustrative example for the Zama SDK — not a production contract.
contract ConfidentialVault is IERC7984Receiver, ZamaEthereumConfig {
    IERC7984 public immutable confidentialToken;

    mapping(address account => euint64 shares) private _shares;

    event Deposit(address indexed from, address indexed beneficiary);
    event Withdraw(address indexed beneficiary);

    error UnauthorizedToken(address caller);
    error NothingToWithdraw(address account);

    constructor(IERC7984 token) {
        confidentialToken = token;
    }

    /// @inheritdoc IERC7984Receiver
    function onConfidentialTransferReceived(address, address from, euint64 amount, bytes calldata data)
        external
        returns (ebool)
    {
        require(msg.sender == address(confidentialToken), UnauthorizedToken(msg.sender));

        // Malformed `data` (< 32 bytes) reverts here, which reverts the whole transfer
        // atomically — the deposit fails rather than refunding. The bound UI always encodes
        // a full address, so this only guards against direct callers.
        address beneficiary = abi.decode(data, (address));

        // No beneficiary: return encrypted `false` so the token refunds the transfer atomically.
        if (beneficiary == address(0)) {
            ebool rejected = FHE.asEbool(false);
            FHE.allowTransient(rejected, msg.sender);
            return rejected;
        }

        euint64 credited = FHE.add(_shares[beneficiary], amount);
        FHE.allowThis(credited);
        FHE.allow(credited, beneficiary);
        _shares[beneficiary] = credited;

        emit Deposit(from, beneficiary);

        ebool accepted = FHE.asEbool(true);
        FHE.allowTransient(accepted, msg.sender);
        return accepted;
    }

    /// @dev Withdraw the caller's full vault balance back to their wallet.
    function withdraw() external {
        euint64 amount = _shares[msg.sender];
        require(FHE.isInitialized(amount), NothingToWithdraw(msg.sender));

        // Checks-effects-interactions: clear the balance before the outbound transfer.
        // Reset the slot to the uninitialized (bytes32(0)) sentinel — not `FHE.asEuint64(0)`,
        // which is an initialized handle. This makes `sharesOf` report empty and a repeat
        // withdraw revert on the `isInitialized` guard above. (`euint64` is a user-defined
        // value type, so `delete` is unavailable; wrap the zero handle directly.)
        _shares[msg.sender] = euint64.wrap(bytes32(0));

        // The token runs the FHE ops inside `confidentialTransfer`, so it needs access to `amount`.
        FHE.allowTransient(amount, address(confidentialToken));
        confidentialToken.confidentialTransfer(msg.sender, amount);

        emit Withdraw(msg.sender);
    }

    /// @dev Caller-decryptable confidential balance held for `account`.
    function sharesOf(address account) external view returns (euint64) {
        return _shares[account];
    }
}
