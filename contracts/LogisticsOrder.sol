// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./ManufacturerRegistry.sol";

/**
 * @title LogisticsOrder
 * @dev Upgradeable ERC-721 NFT contract representing logistics orders with state machine progression
 * Each order is an NFT owned by the receiver, with state controlled by the manufacturer
 * Uses UUPS proxy pattern for upgradeability
 */
contract LogisticsOrder is
    Initializable,
    ERC721Upgradeable,
    OwnableUpgradeable,
    UUPSUpgradeable
{
    // Order progression states - can only move forward
    enum OrderState {
        Created,      // 0 - Order initialized
        PickedUp,     // 1 - Collected from origin
        InTransit,    // 2 - Moving between locations
        AtFacility,   // 3 - Arrived at intermediate facility
        Delivered     // 4 - Final delivery complete
    }

    // Order data structure
    struct Order {
        uint256 tokenId;
        address manufacturer;     // Who created this order
        address receiver;         // Who will receive the order (NFT owner)
        OrderState state;         // Current logistics state
        uint256 createdAt;        // Timestamp of creation
        string ipfsHash;          // Metadata stored on IPFS
    }

    // Maps token ID to order details
    mapping(uint256 => Order) public orders;

    // Auto-incrementing token counter
    uint256 private _nextTokenId;

    // Reference to manufacturer registry for access control
    ManufacturerRegistry public manufacturerRegistry;

    // Events for tracking order lifecycle
    event OrderCreated(
        uint256 indexed tokenId,
        address indexed manufacturer,
        address indexed receiver,
        string ipfsHash
    );

    event StateUpdated(
        uint256 indexed tokenId,
        OrderState newState,
        uint256 timestamp
    );

    event OrderDelivered(
        uint256 indexed tokenId,
        uint256 timestamp
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev Initialize the contract (replaces constructor for upgradeable contracts)
     * @param _manufacturerRegistry Address of ManufacturerRegistry contract
     * @param _initialOwner Address that will own the contract and can perform upgrades
     */
    function initialize(address _manufacturerRegistry, address _initialOwner) public initializer {
        require(_manufacturerRegistry != address(0), "Invalid ManufacturerRegistry address");
        require(_initialOwner != address(0), "Invalid owner address");

        __ERC721_init("LogisticsOrder", "LO");
        __Ownable_init(_initialOwner);
        __UUPSUpgradeable_init();

        manufacturerRegistry = ManufacturerRegistry(_manufacturerRegistry);
        _nextTokenId = 1;
    }

    /**
     * @dev Create a new logistics order (registered manufacturers only)
     * @param receiver Address that will receive the goods (becomes NFT owner)
     * @param ipfsHash IPFS hash containing order metadata
     * @return tokenId The newly created order's token ID
     */
    function createOrder(address receiver, string memory ipfsHash) external returns (uint256) {
        require(manufacturerRegistry.isRegistered(msg.sender), "Caller is not a registered manufacturer");
        require(receiver != address(0), "Invalid receiver address");
        require(bytes(ipfsHash).length > 0, "IPFS hash cannot be empty");

        uint256 tokenId = _nextTokenId++;

        orders[tokenId] = Order({
            tokenId: tokenId,
            manufacturer: msg.sender,
            receiver: receiver,
            state: OrderState.Created,
            createdAt: block.timestamp,
            ipfsHash: ipfsHash
        });

        // Mint NFT to receiver (they own the delivery rights)
        _mint(receiver, tokenId);

        emit OrderCreated(tokenId, msg.sender, receiver, ipfsHash);

        return tokenId;
    }

    /**
     * @dev Update order state (manufacturer only, forward progression only)
     * @param tokenId Order to update
     * @param newState New state to transition to
     */
    function updateState(uint256 tokenId, OrderState newState) external {
        require(_exists(tokenId), "Order does not exist");
        require(orders[tokenId].manufacturer == msg.sender, "Only order manufacturer can update state");

        OrderState currentState = orders[tokenId].state;
        require(_isValidTransition(currentState, newState), "Invalid state transition");

        orders[tokenId].state = newState;

        emit StateUpdated(tokenId, newState, block.timestamp);

        if (newState == OrderState.Delivered) {
            emit OrderDelivered(tokenId, block.timestamp);
        }
    }

    /**
     * @dev Get complete order details
     * @param tokenId Order ID to query
     * @return Order struct with all order data
     */
    function getOrder(uint256 tokenId) external view returns (Order memory) {
        require(_exists(tokenId), "Order does not exist");
        return orders[tokenId];
    }

    /**
     * @dev Get NFT metadata URI (points to IPFS)
     * @param tokenId Order ID
     * @return IPFS URI for metadata
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "Order does not exist");
        return string(abi.encodePacked("ipfs://", orders[tokenId].ipfsHash));
    }

    /**
     * @dev Get total number of orders minted
     * @return Total supply count
     */
    function getTotalSupply() public view returns (uint256) {
        return _nextTokenId - 1;
    }

    /**
     * @dev Get contract version
     * @return Version string
     */
    function version() public pure virtual returns (string memory) {
        return "1.0.0";
    }

    /**
     * @dev Authorize contract upgrades (owner only)
     * @param newImplementation Address of new implementation contract
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        // Additional upgrade validation can be added here if needed
    }

    /**
     * @dev Validate state transitions (forward progression only)
     * @param current Current order state
     * @param next Proposed new state
     * @return bool True if transition is valid
     */
    function _isValidTransition(OrderState current, OrderState next) private pure returns (bool) {
        if (current == OrderState.Created && next == OrderState.PickedUp) return true;
        if (current == OrderState.PickedUp && next == OrderState.InTransit) return true;
        if (current == OrderState.InTransit && next == OrderState.AtFacility) return true;
        if (current == OrderState.AtFacility && next == OrderState.Delivered) return true;
        return false;
    }

    /**
     * @dev Check if order exists
     * @param tokenId Order ID to check
     * @return bool True if order exists
     */
    function _exists(uint256 tokenId) internal view returns (bool) {
        return orders[tokenId].manufacturer != address(0);
    }

    /**
     * @dev Storage gap for future versions
     * Allows adding new state variables in future upgrades without shifting down storage
     * in the inheritance chain. Reduces gap when adding new variables.
     */
    uint256[50] private __gap;
}
