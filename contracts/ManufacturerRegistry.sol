// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ManufacturerRegistry
 * @dev Registry contract to manage authorized manufacturers in the logistics system
 * Only registered and active manufacturers can create orders
 */
contract ManufacturerRegistry is Ownable {
    // Manufacturer data structure
    struct Manufacturer {
        address addr;     // Manufacturer's wallet address
        string name;      // Company name
        bool isActive;    // Active status flag
    }

    // Maps manufacturer address to their registration data
    mapping(address => Manufacturer) public manufacturers;

    // Events for tracking manufacturer lifecycle
    event ManufacturerRegistered(address indexed addr, string name);
    event ManufacturerDeactivated(address indexed addr);
    event ManufacturerActivated(address indexed addr);

    constructor() Ownable(msg.sender) {}

    /**
     * @dev Register a new manufacturer (owner only)
     * @param addr Manufacturer's wallet address
     * @param name Company name
     */
    function registerManufacturer(address addr, string memory name) external onlyOwner {
        require(addr != address(0), "Invalid address");
        require(bytes(name).length > 0, "Name cannot be empty");
        
        manufacturers[addr] = Manufacturer({
            addr: addr,
            name: name,
            isActive: true
        });

        emit ManufacturerRegistered(addr, name);
    }

    /**
     * @dev Deactivate a manufacturer (owner only)
     * @param addr Manufacturer's address to deactivate
     */
    function deactivateManufacturer(address addr) external onlyOwner {
        require(manufacturers[addr].addr != address(0), "Manufacturer not registered");
        require(manufacturers[addr].isActive, "Manufacturer already inactive");
        
        manufacturers[addr].isActive = false;
        emit ManufacturerDeactivated(addr);
    }

    /**
     * @dev Reactivate a manufacturer (owner only)
     * @param addr Manufacturer's address to reactivate
     */
    function activateManufacturer(address addr) external onlyOwner {
        require(manufacturers[addr].addr != address(0), "Manufacturer not registered");
        require(!manufacturers[addr].isActive, "Manufacturer already active");
        
        manufacturers[addr].isActive = true;
        emit ManufacturerActivated(addr);
    }

    /**
     * @dev Check if manufacturer is registered and active
     * @param addr Address to check
     * @return bool True if registered and active
     */
    function isRegistered(address addr) external view returns (bool) {
        return manufacturers[addr].addr != address(0) && manufacturers[addr].isActive;
    }

    /**
     * @dev Get manufacturer details
     * @param addr Manufacturer's address
     * @return Manufacturer struct with all details
     */
    function getManufacturer(address addr) external view returns (Manufacturer memory) {
        return manufacturers[addr];
    }
}