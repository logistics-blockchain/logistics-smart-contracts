// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./LogisticsOrder.sol";

/**
 * @title LogisticsOrderV2
 * @dev Version 2 of LogisticsOrder - adds tracking data functionality
 * Demonstrates safe upgrade pattern: inherits all V1 storage, adds new features
 */
contract LogisticsOrderV2 is LogisticsOrder {
    // New storage variable for V2 functionality
    // Storage is placed after LogisticsOrder's storage (including its __gap)
    mapping(uint256 => string) public trackingData;

    /**
     * @dev Add tracking data to an order (manufacturer only)
     * @param tokenId Order to add tracking data to
     * @param data Tracking information (GPS coordinates, notes, etc.)
     */
    function addTracking(uint256 tokenId, string memory data) external {
        require(_exists(tokenId), "Order does not exist");
        require(orders[tokenId].manufacturer == msg.sender, "Only order manufacturer can add tracking");
        require(bytes(data).length > 0, "Tracking data cannot be empty");

        trackingData[tokenId] = data;

        emit TrackingDataAdded(tokenId, data, block.timestamp);
    }

    /**
     * @dev Get tracking data for an order
     * @param tokenId Order ID
     * @return Tracking data string
     */
    function getTrackingData(uint256 tokenId) external view returns (string memory) {
        require(_exists(tokenId), "Order does not exist");
        return trackingData[tokenId];
    }

    /**
     * @dev Override version to return V2
     * @return Version string
     */
    function version() public pure override returns (string memory) {
        return "2.0.0";
    }

    /**
     * @dev Event emitted when tracking data is added
     */
    event TrackingDataAdded(
        uint256 indexed tokenId,
        string data,
        uint256 timestamp
    );

    /**
     * @dev Storage gap for V2 - reserves space for future V2 upgrades
     * Note: This is separate from LogisticsOrder's __gap which reserves space for V1 additions
     */
    uint256[49] private __gap_v2;
}
