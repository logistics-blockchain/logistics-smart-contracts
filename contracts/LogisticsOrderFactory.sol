// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./LogisticsOrderProxy.sol";
import "./ManufacturerRegistry.sol";

/**
 * @title LogisticsOrderFactory
 * @dev Factory contract that deploys individual LogisticsOrderProxy contracts for each manufacturer
 * Each manufacturer gets their own proxy with isolated storage, but all share the same implementation logic
 */
contract LogisticsOrderFactory {
    // Immutable references to shared contracts
    address public immutable implementation;
    ManufacturerRegistry public immutable manufacturerRegistry;

    // Maps manufacturer address to their deployed proxy contract
    mapping(address => address) public manufacturerContracts;

    // Events
    event ProxyDeployed(
        address indexed manufacturer,
        address indexed proxyAddress,
        uint256 timestamp
    );

    /**
     * @dev Constructor sets up the factory with shared implementation and registry
     * @param _implementation Address of the LogisticsOrder implementation contract
     * @param _manufacturerRegistry Address of the ManufacturerRegistry contract
     */
    constructor(address _implementation, address _manufacturerRegistry) {
        require(_implementation != address(0), "Invalid implementation address");
        require(_manufacturerRegistry != address(0), "Invalid registry address");

        implementation = _implementation;
        manufacturerRegistry = ManufacturerRegistry(_manufacturerRegistry);
    }

    /**
     * @dev Create a new LogisticsOrder proxy for the calling manufacturer
     * Only registered manufacturers can create proxies
     * Each manufacturer can only have one proxy
     * @return proxyAddress The address of the newly deployed proxy
     */
    function createLogisticsOrder() external returns (address proxyAddress) {
        // Verify manufacturer is registered
        require(
            manufacturerRegistry.isRegistered(msg.sender),
            "Caller is not a registered manufacturer"
        );

        // Verify manufacturer doesn't already have a proxy
        require(
            manufacturerContracts[msg.sender] == address(0),
            "Manufacturer already has a logistics contract"
        );

        // Encode initialize call data
        // Manufacturer becomes owner of their own proxy
        bytes memory initializeData = abi.encodeWithSignature(
            "initialize(address,address)",
            address(manufacturerRegistry),
            msg.sender  // Manufacturer is the owner
        );

        // Deploy new proxy with initialization
        LogisticsOrderProxy proxy = new LogisticsOrderProxy(
            implementation,
            initializeData
        );

        proxyAddress = address(proxy);

        // Store mapping
        manufacturerContracts[msg.sender] = proxyAddress;

        emit ProxyDeployed(msg.sender, proxyAddress, block.timestamp);

        return proxyAddress;
    }

    /**
     * @dev Get the proxy contract address for a specific manufacturer
     * @param manufacturer The manufacturer's address
     * @return The address of their proxy contract (address(0) if none)
     */
    function getManufacturerContract(address manufacturer) external view returns (address) {
        return manufacturerContracts[manufacturer];
    }

    /**
     * @dev Check if a manufacturer has deployed a proxy
     * @param manufacturer The manufacturer's address
     * @return True if the manufacturer has a deployed proxy
     */
    function hasContract(address manufacturer) external view returns (bool) {
        return manufacturerContracts[manufacturer] != address(0);
    }

    /**
     * @dev Get the shared implementation address
     * @return The implementation contract address
     */
    function getImplementation() external view returns (address) {
        return implementation;
    }

    /**
     * @dev Get the registry address
     * @return The ManufacturerRegistry contract address
     */
    function getRegistry() external view returns (address) {
        return address(manufacturerRegistry);
    }
}
