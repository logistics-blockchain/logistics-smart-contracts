// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title LogisticsOrderProxy
 * @dev Simple wrapper around OpenZeppelin's ERC1967Proxy for easier deployment
 */
contract LogisticsOrderProxy is ERC1967Proxy {
    constructor(
        address implementation,
        bytes memory data
    ) ERC1967Proxy(implementation, data) {}
}
