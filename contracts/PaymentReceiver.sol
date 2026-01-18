// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title PaymentReceiver
 * @dev Records cross-chain payment intents from Besu logistics orders
 * Deployed on Base Sepolia, called by relay service
 * Owner can update relayer address for key rotation or recovery
 */
contract PaymentReceiver is Ownable {
    address public relayer;

    struct Payment {
        address besuProxy;      // The Besu proxy contract that emitted the event
        uint256 orderId;        // Token ID within that proxy
        uint256 amount;
        address recipient;      // Manufacturer address
        uint256 timestamp;
    }

    // Mapping: keccak256(besuProxy, orderId) => Payment
    mapping(bytes32 => Payment) public payments;

    event PaymentRecorded(
        address indexed besuProxy,
        uint256 indexed orderId,
        uint256 amount,
        address recipient
    );

    event RelayerUpdated(
        address indexed oldRelayer,
        address indexed newRelayer
    );

    constructor() Ownable() {
        relayer = msg.sender;
    }

    /**
     * @dev Update the relayer address (owner only)
     * Use this for key rotation or if relayer key is compromised
     * @param newRelayer New relayer address
     */
    function updateRelayer(address newRelayer) external onlyOwner {
        require(newRelayer != address(0), "Invalid relayer address");
        address oldRelayer = relayer;
        relayer = newRelayer;
        emit RelayerUpdated(oldRelayer, newRelayer);
    }

    function recordPayment(
        address besuProxy,
        uint256 orderId,
        uint256 amount,
        address recipient
    ) external {
        require(msg.sender == relayer, "Only relayer");

        bytes32 key = keccak256(abi.encodePacked(besuProxy, orderId));
        require(payments[key].timestamp == 0, "Already recorded");

        payments[key] = Payment({
            besuProxy: besuProxy,
            orderId: orderId,
            amount: amount,
            recipient: recipient,
            timestamp: block.timestamp
        });

        emit PaymentRecorded(besuProxy, orderId, amount, recipient);
    }

    function getPayment(address besuProxy, uint256 orderId) external view returns (Payment memory) {
        bytes32 key = keccak256(abi.encodePacked(besuProxy, orderId));
        return payments[key];
    }

    function isRecorded(address besuProxy, uint256 orderId) external view returns (bool) {
        bytes32 key = keccak256(abi.encodePacked(besuProxy, orderId));
        return payments[key].timestamp != 0;
    }
}
